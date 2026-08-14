import "server-only";
import { getSupabaseClient } from "./supabaseClient";

/**
 * Screenshots, saved the same way wherever they come from — a new case or a
 * comment. The two paths used to carry their own copy of this, which is how
 * they came to disagree about which one a comment's image belonged to.
 */

const BUCKET = "case-attachments";
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export interface IncomingAttachment {
  name: string;
  /** An inline image under the size limit. */
  dataUrl?: string;
  /** Set instead of dataUrl for a file too big to upload — the user pastes a
   *  link to it rather than losing it. */
  url?: string;
}

export interface SavedAttachment {
  id: string;
  name: string;
  url: string;
}

export function parseIncomingAttachments(raw: unknown, limit = 10): IncomingAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, limit).map((a, i) => ({
    name: typeof a?.name === "string" && a.name.trim() ? a.name.slice(0, 200) : `screenshot-${i + 1}`,
    dataUrl: typeof a?.dataUrl === "string" ? a.dataUrl : undefined,
    url: typeof a?.url === "string" ? a.url : undefined,
  }));
}

function parseDataUrl(dataUrl: string): { contentType: string; bytes: Buffer } | null {
  const match = dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) return null;
  const [, contentType, base64] = match;
  // Images only: this is uploaded to a public bucket, and anything else has
  // no business being served from it.
  if (!contentType.startsWith("image/")) return null;
  return { contentType, bytes: Buffer.from(base64, "base64") };
}

/**
 * Uploads and records each attachment, returning what the client needs to
 * render them straight away.
 *
 * `owner` decides which column the row hangs off. A comment's screenshots
 * carry the case id too, so a case still knows about every image filed under
 * it without having to walk its comments.
 */
export async function saveAttachments(
  owner: { caseId: string; commentId?: string },
  uploadedBy: string,
  items: IncomingAttachment[]
): Promise<SavedAttachment[]> {
  if (items.length === 0) return [];
  const supabase = getSupabaseClient();
  const saved: SavedAttachment[] = [];

  for (const [i, att] of items.entries()) {
    if (att.url && att.url.trim()) {
      const url = att.url.trim();
      // Anything that isn't a link is not a link, whatever it says it is.
      if (!/^https?:\/\//i.test(url)) continue;
      const { data, error } = await supabase
        .from("attachments")
        .insert({
          case_id: owner.caseId,
          comment_id: owner.commentId ?? null,
          file_name: att.name,
          external_url: url,
          uploaded_by: uploadedBy,
        })
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) throw new Error(error.message);
      if (data) saved.push({ id: data.id, name: att.name, url });
      continue;
    }

    if (!att.dataUrl) continue;
    const parsed = parseDataUrl(att.dataUrl);
    if (!parsed || parsed.bytes.byteLength > MAX_ATTACHMENT_BYTES) continue;

    const ext = parsed.contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
    const path = `${owner.caseId}/${Date.now()}-${i}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, parsed.bytes, { contentType: parsed.contentType, upsert: false });
    if (uploadError) throw new Error(`上傳截圖失敗: ${uploadError.message}`);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { data, error } = await supabase
      .from("attachments")
      .insert({
        case_id: owner.caseId,
        comment_id: owner.commentId ?? null,
        file_name: att.name,
        storage_path: path,
        size_bytes: parsed.bytes.byteLength,
        uploaded_by: uploadedBy,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(error.message);
    if (data) saved.push({ id: data.id, name: att.name, url: pub.publicUrl });
  }

  return saved;
}
