"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type {
  BoardData,
  BoardScope,
  SupaAttachment,
  SupaBoard,
  SupaCaseRow,
  SupaComment,
  SupaEdit,
} from "@/lib/supabaseCases";
import { DateRangeFilter, dateBoundsForPreset, type DatePreset, type DateType } from "./DateRangeFilter";
import { EditedTag, RowUpdateTag, type HistoryEntry } from "./EditHistoryTag";
import ImageLightbox, { isViewableImage } from "./ImageLightbox";
import { LANG_STORAGE_KEY, LANG_CHANGE_EVENT, ROLE_PREVIEW_EVENT } from "@/lib/theme";
import NewCaseModal from "./NewCaseModal";
import { LinkEditModal, type LinkKind } from "./LinkEditModal";
import OptionBadge, { type BadgeOption } from "./OptionBadge";
import { FIELD_LIST_KEY, type OptionLists } from "@/lib/optionLists";
import { FIELD_PERMISSION, noPermissions, type ClientSession, type Permissions } from "@/lib/permissions";
import { getRolePreviewPermissions } from "@/lib/rolePreview";

// --- UI language, mirroring CaseBoard.tsx's system (Sidebar's toggle writes
// the same localStorage key; each board reads it once on mount) ---
type Lang = "zh" | "en";

type StringEntry = string | ((...args: never[]) => string);
const STRINGS = {
  newCase: { zh: "新增案件", en: "New case" },
  totalCases: { zh: "總案件數", en: "Total cases" },
  openCases: { zh: "待追蹤(未完成)", en: "Open (not completed)" },
  completedCases: { zh: "已完成", en: "Completed" },
  overdueCases: { zh: "逾期(超過3天未完成)", en: "Overdue (>3 days open)" },
  allClassification: { zh: "全部 Classification", en: "All classifications" },
  allStatuses: { zh: "全部狀態", en: "All statuses" },
  allPriority: { zh: "全部 Priority", en: "All priorities" },
  allIssueTags: { zh: "全部 Issue Tag", en: "All issue tags" },
  nSelected: { zh: (n: number) => `已選 ${n} 項`, en: (n: number) => `${n} selected` },
  clearAllFilters: { zh: "清除篩選", en: "Clear filters" },
  searchPlaceholder: { zh: "搜尋序列 / OP / CS / 內容...", en: "Search seq / OP / CS / content..." },
  resultCount: { zh: (n: number) => `篩選出 ${n} 筆`, en: (n: number) => `${n} results` },
  scopeRecent: {
    zh: (n: number) => `目前顯示近一個月的案件與所有未結案案件，另有 ${n.toLocaleString()} 筆較舊的已結案案件未載入。`,
    en: (n: number) =>
      `Showing the last month plus every open case — ${n.toLocaleString()} older closed cases aren't loaded.`,
  },
  loadAll: { zh: (n: number) => `載入全部 ${n.toLocaleString()} 筆`, en: (n: number) => `Load all ${n.toLocaleString()}` },
  loading: { zh: "載入中…", en: "Loading…" },
  newestFirst: { zh: "↓新到舊", en: "↓Newest" },
  oldestFirst: { zh: "↑舊到新", en: "↑Oldest" },
  addUpdate: { zh: "+ 更新", en: "+ Update" },
  cancel: { zh: "取消", en: "Cancel" },
  editedTag: { zh: "已編輯", en: "edited" },
  editComment: { zh: "編輯", en: "Edit" },
  // Row-level history entries — what happened, not what it said.
  commentAdded: { zh: "新增留言", en: "Comment added" },
  commentEdited: { zh: "編輯留言", en: "Comment edited" },
  commentPlaceholder: { zh: "輸入留言…", en: "Write a comment…" },
  send: { zh: "送出", en: "Send" },
  submitting: { zh: "送出中...", en: "Submitting..." },
  commentRequired: { zh: "請輸入留言內容", en: "Please enter a comment" },
  commentFailed: { zh: "留言失敗", en: "Failed to submit" },
  saveFailed: { zh: "儲存失敗", en: "Failed to save" },
  saving: { zh: "儲存中...", en: "Saving..." },
  save: { zh: "儲存", en: "Save" },
  noMatchingCases: { zh: "沒有符合條件的案件", en: "No matching cases" },
  perPage: { zh: "每頁顯示", en: "Per page" },
  pageIndicator: { zh: (page: number, total: number) => `${page} / ${total}`, en: (page: number, total: number) => `${page} / ${total}` },
  showMore: { zh: "⋯ 顯示更多", en: "⋯ Show more" },
  showLess: { zh: "▲ 收合", en: "▲ Show less" },
  loadError: { zh: (err: string) => `目前無法讀取Supabase資料。原因：${err}`, en: (err: string) => `Unable to load Supabase data right now. Reason: ${err}` },
  allGroupDept: { zh: "全部部門", en: "All departments" },
  allGroupType: { zh: "全部 Type", en: "All types" },
} satisfies Record<string, Record<Lang, StringEntry>>;

function t<K extends keyof typeof STRINGS>(
  lang: Lang,
  key: K,
  ...args: (typeof STRINGS)[K]["en"] extends (...a: infer A) => string ? A : []
): string {
  const entry = STRINGS[key][lang] as StringEntry;
  return typeof entry === "function" ? (entry as (...a: never[]) => string)(...(args as never[])) : entry;
}

const T1HO_STATUS_ORDER = ["pending", "follow up", "move to ho", "已完成"];
const HO_STATUS_ORDER = ["follow up", "procedure", "note", "done", "closed for us"];

const COMPLETED_LABEL = "已完成";

function t1hoStatusCategory(status: string): string {
  const trimmed = status.trim();
  const key = trimmed.toLowerCase();
  if (key === "replied" || key === "closed") return COMPLETED_LABEL;
  return trimmed;
}

function seqNumber(seq: string): number {
  const match = seq.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

// The part of the email before "@" — used as the commenter's display name,
// matching lib/auth.ts's displayNameFromEmail (that one's server-only, so
// this is a small duplicate rather than a shared import).
function displayNameFromEmail(email: string): string {
  return email.split("@")[0];
}

// "sunny.l" -> "Sunny". Account names carry a surname initial and arrive
// lowercased; on a board people read at a glance, the given name is what
// identifies someone. Display only — the stored value is left alone.
function prettyName(raw: string): string {
  const first = raw.trim().split(/[.\s_-]+/)[0] ?? "";
  if (!first) return raw.trim();
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function toHistoryEntry(e: SupaEdit): HistoryEntry {
  return {
    editor: displayNameFromEmail(e.editorEmail),
    when: formatHistoryTimestamp(e.editedAt),
    text: e.previousValue,
  };
}

// MM/DD HH:MM in UTC+8, matching the T1 HO Sheets board's comment format.
function formatTimestampUTC8(iso: string, withSeconds = false): string {
  const date = new Date(iso);
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const min = String(shifted.getUTCMinutes()).padStart(2, "0");
  if (!withSeconds) return `${mm}/${dd} ${hh}:${min}`;
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}:${ss}`;
}

// Edit history is the one place minutes aren't enough: several edits to the
// same cell often land in the same minute, and without seconds the entries
// read as if they happened at the same moment.
function formatHistoryTimestamp(iso: string): string {
  return formatTimestampUTC8(iso, true);
}

// YYYY-MM-DD HH:MM:SS in UTC+8, for the update-date cell. cases.update_date is
// only a date, so a row that changed three times today reads as three
// identical cells; once there's a recorded change we show when it happened.
function formatDateTimeUTC8(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}` +
    ` ${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}:${p(shifted.getUTCSeconds())}`
  );
}

/** The most recent recorded change on a case, or null if there are none. */
function latestUpdateAt(c: SupaCaseRow): string | null {
  let latest: string | null = null;
  const consider = (iso: string) => {
    if (iso && (latest === null || iso > latest)) latest = iso;
  };
  for (const e of c.fieldEdits) consider(e.editedAt);
  for (const cm of c.comments) {
    consider(cm.createdAt);
    for (const ed of cm.edits) consider(ed.editedAt);
  }
  return latest;
}

// --- Draggable/resizable columns (same behavior as CaseBoard.tsx's T1 HO
// table, just with a column set that varies by board) ---
type ColumnKey =
  | "seq"
  | "date"
  | "group"
  | "classification"
  | "cs"
  | "op"
  | "note"
  | "reply"
  | "relatedTicket"
  | "updateDate"
  | "noteLabel"
  | "status"
  | "priority"
  | "issueTag";

// Mockup column set: 序列 日期 部門 CS OP 內容 回答內容 Update date 狀態 Priority Issue Tag
const T1HO_COLUMNS: ColumnKey[] = [
  "seq",
  "date",
  "group",
  "cs",
  "op",
  "note",
  "reply",
  "updateDate",
  "status",
  "priority",
  "issueTag",
];
const HO_COLUMNS: ColumnKey[] = [
  "seq",
  "date",
  "group",
  "classification",
  "op",
  "note",
  "reply",
  "relatedTicket",
  "cs",
  "updateDate",
  "noteLabel",
  "status",
  "priority",
  "issueTag",
];

const COLUMN_LABELS: Record<ColumnKey, { t1ho: Record<Lang, string>; ho: Record<Lang, string> }> = {
  seq: { t1ho: { zh: "序列", en: "Seq" }, ho: { zh: "ID", en: "ID" } },
  date: { t1ho: { zh: "日期", en: "Date" }, ho: { zh: "日期", en: "Date" } },
  group: { t1ho: { zh: "部門", en: "Department" }, ho: { zh: "Type", en: "Type" } },
  classification: { t1ho: { zh: "", en: "" }, ho: { zh: "Classification", en: "Classification" } },
  cs: { t1ho: { zh: "CS", en: "CS" }, ho: { zh: "CS", en: "CS" } },
  op: { t1ho: { zh: "OP", en: "OP" }, ho: { zh: "OP", en: "OP" } },
  note: { t1ho: { zh: "內容", en: "Note" }, ho: { zh: "內容", en: "Note" } },
  reply: { t1ho: { zh: "回答內容", en: "Reply" }, ho: { zh: "追蹤狀況/更新備註", en: "Tracking / Update notes" } },
  relatedTicket: { t1ho: { zh: "", en: "" }, ho: { zh: "Related ticket", en: "Related ticket" } },
  updateDate: { t1ho: { zh: "更新日期", en: "Update date" }, ho: { zh: "更新日期", en: "Update date" } },
  noteLabel: { t1ho: { zh: "", en: "" }, ho: { zh: "Note", en: "Note" } },
  status: { t1ho: { zh: "狀態", en: "Status" }, ho: { zh: "狀態", en: "Status" } },
  priority: { t1ho: { zh: "Priority", en: "Priority" }, ho: { zh: "Priority", en: "Priority" } },
  issueTag: { t1ho: { zh: "Issue Tag", en: "Issue Tag" }, ho: { zh: "Issue Tag", en: "Issue Tag" } },
};

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  seq: 90,
  date: 110,
  group: 100,
  classification: 120,
  cs: 90,
  op: 160,
  note: 260,
  reply: 320,
  relatedTicket: 130,
  updateDate: 168,
  noteLabel: 140,
  status: 140,
  priority: 90,
  issueTag: 120,
};
const MIN_COLUMN_WIDTH = 60;

function isColumnOrder(value: unknown, defaults: ColumnKey[]): value is ColumnKey[] {
  return (
    Array.isArray(value) &&
    value.length === defaults.length &&
    defaults.every((k) => value.includes(k))
  );
}

// A plain character count under-clamps dense CJK text — see CaseBoard.tsx's
// identical helper for the full rationale. Kept as a duplicate here rather
// than a shared import since the two board components otherwise don't share
// a module and this is the only piece worth lifting out on its own.
const FULLWIDTH_RE = /[　-鿿＀-￯]/;

function isVisuallyLong(text: string): boolean {
  if (text.split("\n").length > 3) return true;
  let weighted = 0;
  for (const ch of text) {
    weighted += FULLWIDTH_RE.test(ch) ? 2 : 1;
    if (weighted > 120) return true;
  }
  return false;
}

const URL_RE = /(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/g;
const TRAILING_PUNCT_RE = /[),.;:!?'\]]+$/;

function linkify(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  text.split(URL_RE).forEach((part, i) => {
    if (!part) return;
    if (!/^https?:\/\//.test(part)) {
      nodes.push(part);
      return;
    }
    const trailingMatch = part.match(TRAILING_PUNCT_RE);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const url = trailing ? part.slice(0, part.length - trailing.length) : part;
    nodes.push(
      <a key={`${keyPrefix}-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="reply-link">
        {url}
      </a>
    );
    if (trailing) nodes.push(trailing);
  });
  return nodes;
}

// A text cell that clamps long content behind a show-more toggle and, per
// the mockup, turns into an inline textarea when clicked. Enter saves,
// Shift+Enter adds a newline, Escape cancels, and clicking away saves —
// same keys as the comment forms.
function ClampedCell({
  text,
  cellKey,
  expanded,
  onToggle,
  lang,
  onSave,
  saving = false,
  historyTag,
  attachments,
  displayText,
  onOpenImage,
}: {
  text: string;
  cellKey: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  lang: Lang;
  onSave?: (next: string) => void;
  saving?: boolean;
  historyTag?: ReactNode;
  attachments?: SupaAttachment[];
  // What to show when the raw stored value isn't what a reader wants (the CS
  // column stores "sunny.l" and shows "Sunny"). Editing always works on the
  // stored text, so a save can't silently rewrite it.
  displayText?: string;
  onOpenImage?: (a: SupaAttachment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  function finish(save: boolean) {
    if (!editing) return;
    setEditing(false);
    const next = draft.trim();
    if (save && onSave && next !== text.trim()) onSave(next);
  }

  if (editing) {
    return (
      <td className="note-cell">
        <textarea
          className="inline-edit-ta"
          autoFocus
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              finish(true);
            } else if (e.key === "Escape") {
              setDraft(text);
              setEditing(false);
            }
          }}
        />
        <div className="inline-edit-btns">
          {/* mousedown+preventDefault keeps focus on the textarea so these
              clicks don't fire blur (and its auto-save) first */}
          <button
            type="button"
            className="iec-save"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => finish(true)}
          >
            {t(lang, "save")}
          </button>
          <button
            type="button"
            className="iec-cancel"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setDraft(text);
              setEditing(false);
            }}
          >
            {t(lang, "cancel")}
          </button>
        </div>
      </td>
    );
  }

  const isLong = isVisuallyLong(text);
  const isExpanded = expanded.has(cellKey);
  const canEdit = !!onSave;

  return (
    <td
      className={`note-cell${canEdit ? " editable-cell" : ""}`}
      onClick={(e) => {
        if (!canEdit) return;
        // The show-more toggle and the （已編輯）hover marker both live inside
        // this cell; clicking either shouldn't drop it into edit mode.
        if ((e.target as HTMLElement).closest(".note-toggle, .edited-tag")) return;
        setDraft(text);
        setEditing(true);
      }}
    >
      {text ? (
        <div className={`note-text ${isLong && !isExpanded ? "clamped" : ""}`}>
          {linkify(displayText ?? text, cellKey)}
        </div>
      ) : (
        canEdit && <span className="cell-placeholder">—</span>
      )}
      {historyTag}
      {/* Screenshots attached when the case was created — without these the
          upload in 新增案件 has nowhere to show up. */}
      {onOpenImage &&
        attachments?.map((a) => (
          <div key={a.id}>
            <AttachChip attachment={a} onOpenImage={onOpenImage} />
          </div>
        ))}
      {isLong && (
        <button type="button" className="note-toggle" onClick={() => onToggle(cellKey)}>
          {isExpanded ? t(lang, "showLess") : t(lang, "showMore")}
        </button>
      )}
    </td>
  );
}

function AttachChip({
  attachment,
  onOpenImage,
}: {
  attachment: SupaAttachment;
  onOpenImage: (a: SupaAttachment) => void;
}) {
  const label = `\u{1F4CE} ${attachment.fileName}`;
  // Anything we can render opens in place; a PDF or a pasted link still has
  // to leave the page, so it stays a link rather than pretending otherwise.
  if (!isViewableImage(attachment.fileName, attachment.url)) {
    return (
      <a className="attach-chip" href={attachment.url} target="_blank" rel="noopener noreferrer" title={attachment.fileName}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" className="attach-chip" title={attachment.fileName} onClick={() => onOpenImage(attachment)}>
      {label}
    </button>
  );
}

function CommentThread({
  comments,
  cellKey,
  expanded,
  onToggleClamp,
  editingId,
  editDraft,
  onEditDraftChange,
  editSubmitting,
  editError,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  lang,
  formOpen,
  onOpenForm,
  onCloseForm,
  commentDraft,
  onCommentDraftChange,
  commentSubmitting,
  commentError,
  onSubmitComment,
  canComment,
  onOpenImage,
}: {
  comments: SupaComment[];
  cellKey: string;
  expanded: Set<string>;
  onToggleClamp: (key: string) => void;
  editingId: string | null;
  editDraft: string;
  onEditDraftChange: (v: string) => void;
  editSubmitting: boolean;
  editError: string | null;
  onStartEdit: (id: string, message: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (id: string) => void;
  lang: Lang;
  formOpen: boolean;
  onOpenForm: () => void;
  onCloseForm: () => void;
  commentDraft: string;
  onCommentDraftChange: (v: string) => void;
  commentSubmitting: boolean;
  commentError: string | null;
  onSubmitComment: () => void;
  canComment: boolean;
  onOpenImage: (a: SupaAttachment) => void;
}) {
  const isExpanded = expanded.has(cellKey);
  // Collapsed threads show only the first comment (the mockup's
  // layoutCommentClamp) AND cap its height, so a single very long update
  // can't blow the row open either — the mockup's sample comments were all
  // short, so only real data exposes that second case.
  const visible = isExpanded ? comments : comments.slice(0, 1);
  const canExpand = comments.length > 1 || (comments.length > 0 && isVisuallyLong(comments[0].body));

  return (
    <td className="comment-thread">
      {comments.length > 0 && (
        <div className={`cell-clip${isExpanded ? " expanded" : ""}`}>
          {visible.map((c) => {
            const entryKey = `${cellKey}-${c.id}`;
            const isEditingThis = editingId === c.id;
            return (
              <div key={entryKey} className="comment">
                <span className="who">{prettyName(displayNameFromEmail(c.authorEmail))}</span>{" "}
                <span className="meta">{formatTimestampUTC8(c.createdAt)}</span>
                {/* Comments edited before the history table existed still get
                    the marker — there's just nothing to show on hover. */}
                {c.edits.length > 0 ? (
                  <EditedTag entries={c.edits.map(toHistoryEntry)} lang={lang} />
                ) : (
                  c.editedAt && <span className="edited-tag">{t(lang, "editedTag")}</span>
                )}
                {!isEditingThis && canComment && (
                  <button type="button" className="comment-edit-btn" onClick={() => onStartEdit(c.id, c.body)}>
                    {t(lang, "editComment")}
                  </button>
                )}
                {isEditingThis ? (
                  <div className="comment-edit-form">
                    <textarea value={editDraft} onChange={(e) => onEditDraftChange(e.target.value)} />
                    <div className="cef-btns">
                      <button type="button" className="cef-save" disabled={editSubmitting} onClick={() => onSubmitEdit(c.id)}>
                        {editSubmitting ? t(lang, "saving") : t(lang, "save")}
                      </button>
                      <button type="button" className="cef-cancel" onClick={onCancelEdit}>
                        {t(lang, "cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <br />
                    <span className="comment-text">{linkify(c.body, entryKey)}</span>
                    {c.attachments.map((a) => (
                      <span key={a.id}>
                        <br />
                        <AttachChip attachment={a} onOpenImage={onOpenImage} />
                      </span>
                    ))}
                  </>
                )}
                {isEditingThis && editError && <div className="comment-error">{editError}</div>}
              </div>
            );
          })}
        </div>
      )}
      {canExpand && (
        <button type="button" className="show-more-btn" onClick={() => onToggleClamp(cellKey)}>
          {isExpanded ? t(lang, "showLess") : t(lang, "showMore")}
        </button>
      )}
      {canComment && (
      <div className={`add-comment${formOpen ? " open" : ""}`}>
        {formOpen ? (
          <div className="add-comment-form">
            <textarea
              rows={1}
              autoFocus
              placeholder={t(lang, "commentPlaceholder")}
              value={commentDraft}
              onChange={(e) => onCommentDraftChange(e.target.value)}
              onKeyDown={(e) => {
                // Enter submits, Shift+Enter adds a newline, Escape closes —
                // matching the mockup's wireCommentTextareaKeys.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmitComment();
                } else if (e.key === "Escape") {
                  onCloseForm();
                }
              }}
            />
            {commentError && <div className="comment-error">{commentError}</div>}
            <button type="button" className="send-comment-btn" disabled={commentSubmitting} onClick={onSubmitComment}>
              {commentSubmitting ? t(lang, "submitting") : t(lang, "send")}
            </button>
          </div>
        ) : (
          <button type="button" className="add-comment-btn" onClick={onOpenForm}>
            {t(lang, "addUpdate")}
          </button>
        )}
      </div>
      )}
    </td>
  );
}

// Related ticket / Note. A label with a URL renders as a link, a label
// without one as plain text, and an empty value as an em dash — with a ✎
// button on hover that opens the link editor, matching the mockup.
function LinkCell({
  label,
  url,
  onEdit,
  historyTag,
}: {
  label: string | null;
  url: string | null;
  onEdit?: () => void;
  historyTag?: ReactNode;
}) {
  const text = (label ?? "").trim();
  return (
    <td className="link-cell">
      <span className="link-content">
        {text ? (
          url ? (
            <a className="ext-link" href={url} target="_blank" rel="noopener noreferrer">
              {text}
            </a>
          ) : (
            text
          )
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </span>
      {historyTag}
      {onEdit && (
        <button type="button" className="link-edit-btn" onClick={onEdit} aria-label="edit">
          ✎
        </button>
      )}
    </td>
  );
}

function MultiSelect({
  allLabel,
  options,
  selected,
  onChange,
  lang,
  labelFor,
}: {
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  lang: Lang;
  // Lets a caller show a translated label for an option (e.g. the synthetic
  // "已完成" status category) while the underlying value used for
  // filtering/state stays the same in every language.
  labelFor?: (opt: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const summary =
    selected.length === 0 ? allLabel : selected.length === 1 ? (labelFor ? labelFor(selected[0]) : selected[0]) : t(lang, "nSelected", selected.length);

  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  }

  return (
    <div className="multiselect" ref={rootRef}>
      <button type="button" className="multiselect-summary" onClick={() => setOpen((o) => !o)}>
        {summary} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="multiselect-menu">
          <label className="multiselect-option">
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            {allLabel}
          </label>
          {options.map((opt) => (
            <label key={opt} className="multiselect-option">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              {labelFor ? labelFor(opt) : opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SupaBoard({
  board,
  initialBoard,
  initialError,
  optionLists,
  session,
}: {
  board: SupaBoard;
  initialBoard: BoardData;
  initialError: string | null;
  optionLists: OptionLists;
  session: ClientSession | null;
}) {
  const [cases, setCases] = useState(initialBoard.cases);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  // The board doesn't load every case up front — see lib/supabaseCases.ts.
  // These track what's actually in hand so the UI can say so and offer the
  // rest, rather than quietly showing a partial board as if it were whole.
  const [totalCount, setTotalCount] = useState(initialBoard.totalCount);
  const [scope, setScope] = useState<BoardScope>(initialBoard.scope);

  const [lang, setLang] = useState<Lang>("zh");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "en" || saved === "zh") setLang(saved);
    } catch {
      // ignore
    }
    // See CaseBoard.tsx's identical listener for why this is needed —
    // localStorage's own "storage" event doesn't fire in the tab that made
    // the write, so without this the toggle only takes effect after
    // navigating to another page.
    function handleLangChange(e: Event) {
      const next = (e as CustomEvent<Lang>).detail;
      if (next === "en" || next === "zh") setLang(next);
    }
    window.addEventListener(LANG_CHANGE_EVENT, handleLangChange);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, handleLangChange);
  }, []);

  const [groupFilter, setGroupFilter] = useState<string[]>([]); // 部門 (t1ho) / Type (ho)
  const [classFilter, setClassFilter] = useState<string[]>([]); // Classification (ho only)
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [issueTagFilter, setIssueTagFilter] = useState<string[]>([]);
  const [dateType, setDateType] = useState<DateType>("create");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [search, setSearch] = useState("");

  const dateBounds = useMemo(
    () => dateBoundsForPreset(datePreset, rangeStart, rangeEnd),
    [datePreset, rangeStart, rangeEnd]
  );

  // Asking for dates older than what's loaded has to actually fetch them,
  // otherwise the filter silently returns an empty range that looks like
  // "there were no cases then".
  const cutoff = initialBoard.cutoff;
  const rangeStartISO = dateBounds ? dateBounds[0] : null;
  useEffect(() => {
    if (scope !== "recent" || loading || !cutoff) return;
    // A preset with no bounds ("all") already shows everything loaded; only a
    // range that starts before the window needs the rest fetched.
    if (rangeStartISO !== null && rangeStartISO < cutoff) load("all");
    // load/loading are read fresh on each run; re-running on filter change is
    // the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStartISO, scope, cutoff]);
  const [dateSort, setDateSort] = useState<"none" | "desc" | "asc">("desc");
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  function toggleNote(key: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // --- Comment write / edit panel ---
  const [openCommentKey, setOpenCommentKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Every popup in this app closes on an outside click — dropdowns, the
  // calendar, the accent picker — and the comment form is no exception.
  useEffect(() => {
    if (!openCommentKey) return;
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".add-comment")) setOpenCommentKey(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openCommentKey]);

  // --- Signed-in user and what they're allowed to change ---
  // Handed down from the server render. Fetching this after mount is what
  // made 新增案件 and the editable cells appear a beat after the rest of the
  // board on every page switch.
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const me = session?.name ?? "";
  const permissions = session?.permissions ?? noPermissions();

  // Admins can preview the board as another role. This only changes what
  // this browser shows — the server still decides what it will accept.
  const [previewPerms, setPreviewPerms] = useState<Permissions | null>(null);
  useEffect(() => {
    // The board remounts on every page switch while the sidebar (and its
    // preview switcher) does not, so pick the current preview back up rather
    // than waiting for the next click on the switcher.
    setPreviewPerms(getRolePreviewPermissions());
    function handlePreview(e: Event) {
      setPreviewPerms((e as CustomEvent<Permissions | null>).detail);
    }
    window.addEventListener(ROLE_PREVIEW_EVENT, handlePreview);
    return () => window.removeEventListener(ROLE_PREVIEW_EVENT, handlePreview);
  }, []);

  const perms = previewPerms ?? permissions;
  const canEditField = (field: string) => {
    const needed = FIELD_PERMISSION[field];
    return !!needed && perms[needed];
  };
  const canComment = perms[board === "t1ho" ? "comment.t1ho" : "comment.ho"];

  // The audit row the server just wrote, mirrored into local state so the
  // （已編輯）marker appears with the edit instead of on the next reload.
  function newEdit(field: string, previousValue: string): SupaEdit {
    return {
      field,
      previousValue,
      editorEmail: session?.email ?? "",
      editedAt: new Date().toISOString(),
    };
  }

  // Screenshots open over the board rather than in a new tab.
  const [lightbox, setLightbox] = useState<SupaAttachment | null>(null);

  // --- Categorical cells (click-to-change option badges) ---
  const [fieldSaving, setFieldSaving] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function badgeOptions(field: string): BadgeOption[] {
    const listKey = FIELD_LIST_KEY[board][field];
    if (!listKey) return [];
    return optionLists[listKey].map((o) => ({ name: o.name, color: o.color }));
  }

  async function saveField(c: SupaCaseRow, field: string, value: string) {
    setFieldSaving(`${c.id}-${field}`);
    setFieldError(null);
    try {
      const res = await fetch("/api/cases-supabase/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: c.id, board, field, value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFieldError(data.error || t(lang, "saveFailed"));
        return;
      }
      const PATCH_KEY: Record<string, keyof SupaCaseRow> = {
        dept: "dept",
        type: "hoType",
        class: "hoClass",
        issueTag: "issueTag",
        priority: "priority",
        status: "status",
        op: "op",
        cs: "cs",
        content: "content",
      };
      const patch = { [PATCH_KEY[field]]: value } as Partial<SupaCaseRow>;
      setCases((prev) =>
        prev.map((row) => {
          if (row.id !== c.id) return row;
          const previousValue = String(row[PATCH_KEY[field]] ?? "");
          return {
            ...row,
            ...patch,
            updateDate: data.case?.update_date ?? row.updateDate,
            // Mirror the audit row the API just wrote, so the （已編輯）marker
            // shows up on this edit rather than only after a refresh.
            fieldEdits:
              previousValue === value
                ? row.fieldEdits
                : [...row.fieldEdits, newEdit(field, previousValue)],
          };
        })
      );
    } finally {
      setFieldSaving(null);
    }
  }

  // --- Related ticket / Note link editor ---
  const [linkTarget, setLinkTarget] = useState<{ caseId: string; kind: LinkKind } | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  function openLinkEditor(c: SupaCaseRow, kind: LinkKind) {
    setLinkTarget({ caseId: c.id, kind });
    setLinkError(null);
  }

  async function saveLink(label: string | null, url: string | null) {
    if (!linkTarget) return;
    setLinkSaving(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/cases-supabase/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: linkTarget.caseId, kind: linkTarget.kind, label, url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLinkError(data.error || t(lang, "saveFailed"));
        return;
      }
      const isTicket = linkTarget.kind === "ticket";
      setCases((prev) =>
        prev.map((row) => {
          if (row.id !== linkTarget.caseId) return row;
          const prevLabel = (isTicket ? row.relatedTicketLabel : row.noteLabel) ?? "";
          const prevUrl = (isTicket ? row.relatedTicketUrl : row.noteUrl) ?? "";
          const changed = prevLabel !== (label ?? "") || prevUrl !== (label ? url ?? "" : "");
          return {
            ...row,
            ...(isTicket
              ? { relatedTicketLabel: label, relatedTicketUrl: url }
              : { noteLabel: label, noteUrl: url }),
            updateDate: data.case?.update_date ?? row.updateDate,
            fieldEdits: changed
              ? [
                  ...row.fieldEdits,
                  newEdit(
                    isTicket ? "relatedTicket" : "note",
                    prevUrl ? `${prevLabel} (${prevUrl})` : prevLabel
                  ),
                ]
              : row.fieldEdits,
          };
        })
      );
      setLinkTarget(null);
    } finally {
      setLinkSaving(false);
    }
  }

  const linkCase = linkTarget ? cases.find((c) => c.id === linkTarget.caseId) : undefined;

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function openComment(key: string) {
    setOpenCommentKey(key);
    setCommentDraft("");
    setCommentError(null);
  }

  async function submitComment(c: SupaCaseRow) {
    if (!commentDraft.trim()) {
      setCommentError(t(lang, "commentRequired"));
      return;
    }
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const res = await fetch("/api/cases-supabase/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: c.id, board, message: commentDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommentError(data.error || t(lang, "commentFailed"));
        return;
      }
      const newComment: SupaComment = data.comment;
      setCases((prev) => prev.map((row) => (row.id === c.id ? { ...row, comments: [...row.comments, newComment], latestNote: newComment.body } : row)));
      setOpenCommentKey(null);
    } finally {
      setCommentSubmitting(false);
    }
  }

  function startEdit(id: string, message: string) {
    setEditingCommentId(id);
    setEditDraft(message);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingCommentId(null);
    setEditError(null);
  }

  async function submitEdit(caseId: string, commentId: string) {
    if (!editDraft.trim()) {
      setEditError(t(lang, "commentRequired"));
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch("/api/cases-supabase/comment/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, newMessage: editDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || t(lang, "saveFailed"));
        return;
      }
      setCases((prev) =>
        prev.map((row) =>
          row.id === caseId
            ? {
                ...row,
                comments: row.comments.map((cm) =>
                  cm.id === commentId
                    ? {
                        ...cm,
                        body: data.comment.body,
                        editedAt: data.comment.edited_at,
                        edits:
                          cm.body === data.comment.body
                            ? cm.edits
                            : [...cm.edits, { ...newEdit("comment", cm.body) }],
                      }
                    : cm
                ),
              }
            : row
        )
      );
      setEditingCommentId(null);
    } finally {
      setEditSubmitting(false);
    }
  }

  const groupValue = (c: SupaCaseRow) => (board === "t1ho" ? c.dept : c.hoType) ?? "";

  const groups = useMemo(
    () => Array.from(new Set(cases.map(groupValue).filter(Boolean))).sort(),
    [cases, board]
  );

  const classifications = useMemo(
    () => Array.from(new Set(cases.map((c) => c.hoClass ?? "").filter(Boolean))).sort(),
    [cases]
  );

  const statuses = useMemo(() => {
    const order = board === "t1ho" ? T1HO_STATUS_ORDER : HO_STATUS_ORDER;
    const unique = Array.from(
      new Set(cases.map((c) => (board === "t1ho" ? t1hoStatusCategory(c.status) : c.status.trim())).filter(Boolean))
    );
    return unique.sort((a, b) => {
      const ia = order.indexOf(a.toLowerCase());
      const ib = order.indexOf(b.toLowerCase());
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [cases, board]);

  const priorities = useMemo(
    () => Array.from(new Set(cases.map((c) => c.priority.trim()).filter(Boolean))).sort(),
    [cases]
  );

  const issueTags = useMemo(
    () => Array.from(new Set(cases.map((c) => c.issueTag ?? "").filter(Boolean))).sort(),
    [cases]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (groupFilter.length > 0 && !groupFilter.includes(groupValue(c))) return false;
      if (board === "ho" && classFilter.length > 0 && !classFilter.includes(c.hoClass ?? "")) return false;
      if (statusFilter.length > 0) {
        const cat = board === "t1ho" ? t1hoStatusCategory(c.status) : c.status.trim();
        if (!statusFilter.includes(cat)) return false;
      }
      if (priorityFilter.length > 0 && !priorityFilter.includes(c.priority.trim())) return false;
      if (issueTagFilter.length > 0 && !issueTagFilter.includes(c.issueTag ?? "")) return false;
      if (dateBounds) {
        const d = dateType === "update" ? c.updateDate || c.date : c.date;
        if (d < dateBounds[0] || d > dateBounds[1]) return false;
      }
      if (q) {
        const haystack = `${c.seq} ${c.op ?? ""} ${c.cs} ${c.content} ${c.latestNote} ${c.issueTag ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [cases, groupFilter, classFilter, statusFilter, priorityFilter, issueTagFilter, dateBounds, dateType, search, board]);

  const sorted = useMemo(() => {
    const withMeta = filtered.map((c) => ({ c, t: new Date(c.date).getTime() || 0, n: seqNumber(c.seq) }));
    withMeta.sort((a, b) => {
      if (dateSort !== "none") {
        const diff = dateSort === "desc" ? b.t - a.t : a.t - b.t;
        if (diff !== 0) return diff;
        return dateSort === "desc" ? b.n - a.n : a.n - b.n;
      }
      return a.n - b.n;
    });
    return withMeta.map((x) => x.c);
  }, [filtered, dateSort]);

  function toggleDateSort() {
    setDateSort((prev) => (prev === "none" ? "desc" : prev === "desc" ? "asc" : "none"));
  }

  // --- Pagination (matches CaseBoard.tsx's T1 HO table) ---
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [filtered]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  const pagedRows = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sorted, currentPage, pageSize]
  );

  const openCount = filtered.filter((c) => !c.isCompleted).length;
  const completedCount = filtered.filter((c) => c.isCompleted).length;
  const overdueCount = filtered.filter((c) => c.isOverdue).length;

  // --- Draggable column order / resizable column widths ---
  const columns = board === "t1ho" ? T1HO_COLUMNS : HO_COLUMNS;
  const orderStorageKey = `t1ho_supa_column_order_${board}`;
  const widthsStorageKey = `t1ho_supa_column_widths_${board}`;

  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(columns);
  const draggedColumnRef = useRef<ColumnKey | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(orderStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (isColumnOrder(parsed, columns)) setColumnOrder(parsed);
      else setColumnOrder(columns);
    } catch {
      setColumnOrder(columns);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  function moveColumn(dragged: ColumnKey, target: ColumnKey) {
    if (dragged === target) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== dragged);
      next.splice(next.indexOf(target), 0, dragged);
      try {
        localStorage.setItem(orderStorageKey, JSON.stringify(next));
      } catch {
        // ignore write failures (private browsing, storage full, etc.)
      }
      return next;
    });
  }

  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(widthsStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        setColumnWidths((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore malformed/unavailable localStorage — fall back to default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  function startColumnResize(key: ColumnKey, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[key];

    function onMove(ev: MouseEvent) {
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + (ev.clientX - startX));
      setColumnWidths((prev) => ({ ...prev, [key]: nextWidth }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setColumnWidths((prev) => {
        try {
          localStorage.setItem(widthsStorageKey, JSON.stringify(prev));
        } catch {
          // ignore write failures
        }
        return prev;
      });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // --- Edit history (the （已編輯）markers and the update-date hover card) ---

  // Which column heading names each recorded field, so the row-level tooltip
  // reads "狀態" rather than "status".
  const FIELD_COLUMN: Record<string, ColumnKey> = {
    dept: "group",
    type: "group",
    class: "classification",
    status: "status",
    priority: "priority",
    issueTag: "issueTag",
    op: "op",
    cs: "cs",
    content: "note",
    relatedTicket: "relatedTicket",
    note: "noteLabel",
  };

  function fieldHistory(c: SupaCaseRow, field: string): HistoryEntry[] {
    return c.fieldEdits.filter((e) => e.field === field).map(toHistoryEntry);
  }

  function fieldTag(c: SupaCaseRow, field: string): ReactNode {
    const entries = fieldHistory(c, field);
    if (entries.length === 0) return null;
    return <EditedTag entries={entries} lang={lang} />;
  }

  // The row's own history: which fields changed and when, plus comments
  // posted and edited. Deliberately no before/after values — those live on
  // each field's own marker.
  function rowHistory(c: SupaCaseRow): HistoryEntry[] {
    const entries: (HistoryEntry & { at: string })[] = c.fieldEdits.map((e) => {
      const col = FIELD_COLUMN[e.field];
      return {
        editor: displayNameFromEmail(e.editorEmail),
        when: formatHistoryTimestamp(e.editedAt),
        text: col ? COLUMN_LABELS[col][board][lang] || e.field : e.field,
        at: e.editedAt,
      };
    });
    for (const cm of c.comments) {
      entries.push({
        editor: displayNameFromEmail(cm.authorEmail),
        when: formatHistoryTimestamp(cm.createdAt),
        text: t(lang, "commentAdded"),
        at: cm.createdAt,
      });
      for (const ed of cm.edits) {
        entries.push({
          editor: displayNameFromEmail(ed.editorEmail),
          when: formatHistoryTimestamp(ed.editedAt),
          text: t(lang, "commentEdited"),
          at: ed.editedAt,
        });
      }
    }
    entries.sort((a, b) => a.at.localeCompare(b.at));
    return entries.map(({ editor, when, text }) => ({ editor, when, text }));
  }

  function renderCell(colKey: ColumnKey, c: SupaCaseRow, rowKey: string): ReactNode {
    switch (colKey) {
      case "seq":
        return <td key={colKey}>{c.seq}</td>;
      case "date":
        return <td key={colKey}>{c.date}</td>;
      case "group":
        return (
          <td key={colKey}>
            <OptionBadge
              value={board === "t1ho" ? c.dept : c.hoType}
              options={badgeOptions(board === "t1ho" ? "dept" : "type")}
              chip
              canEdit={canEditField(board === "t1ho" ? "dept" : "type")}
              isSubmitting={fieldSaving === `${c.id}-${board === "t1ho" ? "dept" : "type"}`}
              onChange={(next) => saveField(c, board === "t1ho" ? "dept" : "type", next)}
            />
            {fieldTag(c, board === "t1ho" ? "dept" : "type")}
          </td>
        );
      case "classification":
        return (
          <td key={colKey}>
            <OptionBadge
              value={c.hoClass}
              options={badgeOptions("class")}
              chip
              canEdit={canEditField("class")}
              isSubmitting={fieldSaving === `${c.id}-class`}
              onChange={(next) => saveField(c, "class", next)}
            />
            {fieldTag(c, "class")}
          </td>
        );
      case "cs":
        return (
          <ClampedCell
            key={colKey}
            text={c.cs}
            cellKey={`${rowKey}-cs`}
            expanded={expandedNotes}
            onToggle={toggleNote}
            lang={lang}
            onSave={canEditField("cs") ? (next) => saveField(c, "cs", next) : undefined}
            saving={fieldSaving === `${c.id}-cs`}
            historyTag={fieldTag(c, "cs")}
            displayText={prettyName(c.cs)}
          />
        );
      case "op":
        return (
          <ClampedCell
            key={colKey}
            text={c.op ?? ""}
            cellKey={`${rowKey}-op`}
            expanded={expandedNotes}
            onToggle={toggleNote}
            lang={lang}
            onSave={canEditField("op") ? (next) => saveField(c, "op", next) : undefined}
            saving={fieldSaving === `${c.id}-op`}
            historyTag={fieldTag(c, "op")}
          />
        );
      case "note":
        return (
          <ClampedCell
            key={colKey}
            text={c.content}
            cellKey={`${rowKey}-note`}
            expanded={expandedNotes}
            onToggle={toggleNote}
            lang={lang}
            onSave={canEditField("content") ? (next) => saveField(c, "content", next) : undefined}
            saving={fieldSaving === `${c.id}-content`}
            historyTag={fieldTag(c, "content")}
            attachments={c.attachments}
            onOpenImage={setLightbox}
          />
        );
      case "reply":
        return (
          <CommentThread
            key={colKey}
            comments={c.comments}
            cellKey={`${rowKey}-reply`}
            expanded={expandedNotes}
            onToggleClamp={toggleNote}
            editingId={editingCommentId}
            editDraft={editDraft}
            onEditDraftChange={setEditDraft}
            editSubmitting={editSubmitting}
            editError={editError}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSubmitEdit={(commentId) => submitEdit(c.id, commentId)}
            lang={lang}
            formOpen={openCommentKey === rowKey}
            canComment={canComment}
            onOpenForm={() => openComment(rowKey)}
            onCloseForm={() => setOpenCommentKey(null)}
            commentDraft={commentDraft}
            onCommentDraftChange={setCommentDraft}
            commentSubmitting={commentSubmitting}
            commentError={commentError}
            onSubmitComment={() => submitComment(c)}
            onOpenImage={setLightbox}
          />
        );
      case "relatedTicket":
        return (
          <LinkCell
            key={colKey}
            label={c.relatedTicketLabel}
            url={c.relatedTicketUrl}
            onEdit={perms["edit.link"] ? () => openLinkEditor(c, "ticket") : undefined}
            historyTag={fieldTag(c, "relatedTicket")}
          />
        );
      case "updateDate": {
        // A case with no recorded change keeps the plain date — there's no
        // time to show, and inventing one would be worse than the date.
        const at = latestUpdateAt(c);
        return (
          <td key={colKey}>
            <RowUpdateTag
              label={at ? formatDateTimeUTC8(at) : c.updateDate}
              entries={rowHistory(c)}
              lang={lang}
            />
          </td>
        );
      }
      case "noteLabel":
        return (
          <LinkCell
            key={colKey}
            label={c.noteLabel}
            url={c.noteUrl}
            onEdit={perms["edit.link"] ? () => openLinkEditor(c, "note") : undefined}
            historyTag={fieldTag(c, "note")}
          />
        );
      case "status":
        return (
          <td key={colKey}>
            <OptionBadge
              value={c.status}
              options={badgeOptions("status")}
              canEdit={canEditField("status")}
              isSubmitting={fieldSaving === `${c.id}-status`}
              onChange={(next) => saveField(c, "status", next)}
            />
            {fieldTag(c, "status")}
          </td>
        );
      case "priority":
        return (
          <td key={colKey}>
            <OptionBadge
              value={c.priority}
              options={badgeOptions("priority")}
              canEdit={canEditField("priority")}
              isSubmitting={fieldSaving === `${c.id}-priority`}
              onChange={(next) => saveField(c, "priority", next)}
            />
            {fieldTag(c, "priority")}
          </td>
        );
      case "issueTag":
        return (
          <td key={colKey}>
            <OptionBadge
              value={c.issueTag}
              options={badgeOptions("issueTag")}
              chip
              canEdit={canEditField("issueTag")}
              isSubmitting={fieldSaving === `${c.id}-issueTag`}
              onChange={(next) => saveField(c, "issueTag", next)}
            />
            {fieldTag(c, "issueTag")}
          </td>
        );
    }
  }

  function renderRow(c: SupaCaseRow, key: string) {
    return (
      <tr key={key}>
        {columnOrder.map((colKey) => renderCell(colKey, c, key))}
      </tr>
    );
  }

  async function load(nextScope: BoardScope) {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases-supabase?board=${board}&scope=${nextScope}`, { cache: "no-store" });
      const data = await res.json();
      setCases(data.cases);
      setError(data.error);
      if (typeof data.totalCount === "number") setTotalCount(data.totalCount);
      if (data.scope === "recent" || data.scope === "all") setScope(data.scope);
    } finally {
      setLoading(false);
    }
  }

  // Refresh keeps whatever scope is already loaded, so hitting it after
  // 載入全部 doesn't silently drop back to the recent window.
  const refresh = () => load(scope);
  const notLoaded = Math.max(totalCount - cases.length, 0);

  return (
    <div className="board-root">
      {error && <div className="banner">{t(lang, "loadError", error)}</div>}
      {fieldError && <div className="banner">{fieldError}</div>}

      <div className="summary">
        <div className="stat">
          <div className="value">{filtered.length}</div>
          <div className="label">{t(lang, "totalCases")}</div>
        </div>
        <div className="stat">
          <div className="value">{openCount}</div>
          <div className="label">{t(lang, "openCases")}</div>
        </div>
        <div className="stat">
          <div className="value">{completedCount}</div>
          <div className="label">{t(lang, "completedCases")}</div>
        </div>
        <div className="stat overdue">
          <div className="value">{overdueCount}</div>
          <div className="label">{t(lang, "overdueCases")}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filters">
          <MultiSelect
            allLabel={t(lang, board === "t1ho" ? "allGroupDept" : "allGroupType")}
            options={groups}
            selected={groupFilter}
            onChange={setGroupFilter}
            lang={lang}
          />
          {board === "ho" && (
            <MultiSelect
              allLabel={t(lang, "allClassification")}
              options={classifications}
              selected={classFilter}
              onChange={setClassFilter}
              lang={lang}
            />
          )}
          <MultiSelect
            allLabel={t(lang, "allStatuses")}
            options={statuses}
            selected={statusFilter}
            onChange={setStatusFilter}
            lang={lang}
            labelFor={(opt) => (opt === COMPLETED_LABEL ? t(lang, "completedCases") : opt)}
          />
          <MultiSelect allLabel={t(lang, "allPriority")} options={priorities} selected={priorityFilter} onChange={setPriorityFilter} lang={lang} />
          <MultiSelect allLabel={t(lang, "allIssueTags")} options={issueTags} selected={issueTagFilter} onChange={setIssueTagFilter} lang={lang} />
          <DateRangeFilter
            lang={lang}
            dateType={dateType}
            onDateTypeChange={setDateType}
            preset={datePreset}
            onPresetChange={setDatePreset}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onRangeChange={(start, end) => {
              setRangeStart(start);
              setRangeEnd(end);
            }}
          />
          {(groupFilter.length > 0 ||
            classFilter.length > 0 ||
            statusFilter.length > 0 ||
            priorityFilter.length > 0 ||
            issueTagFilter.length > 0 ||
            datePreset !== "all" ||
            search) && (
            <button
              type="button"
              className="refresh-btn"
              onClick={() => {
                setGroupFilter([]);
                setClassFilter([]);
                setStatusFilter([]);
                setPriorityFilter([]);
                setIssueTagFilter([]);
                setDatePreset("all");
                setRangeStart(null);
                setRangeEnd(null);
                setSearch("");
              }}
            >
              {t(lang, "clearAllFilters")}
            </button>
          )}
          <div className="search-group">
            <input
              type="text"
              placeholder={t(lang, "searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="result-count">{t(lang, "resultCount", filtered.length)}</span>
          </div>
        </div>
        {/* The board opens on the last month plus everything still open, so
            say plainly what isn't loaded rather than letting a partial board
            look complete. */}
        {scope === "recent" && notLoaded > 0 && (
          <div className="scope-note">
            <span>{t(lang, "scopeRecent", notLoaded)}</span>
            <button type="button" className="refresh-btn" disabled={loading} onClick={() => load("all")}>
              {loading ? t(lang, "loading") : t(lang, "loadAll", totalCount)}
            </button>
          </div>
        )}
        {perms["case.create"] && (
        <button type="button" className="primary" onClick={() => setNewCaseOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>{t(lang, "newCase")}</span>
        </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <colgroup>
            {columnOrder.map((colKey) => (
              <col key={colKey} style={{ width: columnWidths[colKey] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columnOrder.map((colKey) => {
                const dragProps = {
                  draggable: true,
                  onDragStart: () => {
                    draggedColumnRef.current = colKey;
                  },
                  onDragOver: (e: DragEvent) => e.preventDefault(),
                  onDrop: (e: DragEvent) => {
                    e.preventDefault();
                    if (draggedColumnRef.current) moveColumn(draggedColumnRef.current, colKey);
                    draggedColumnRef.current = null;
                  },
                };
                const resizeHandle = (
                  <span className="col-resize-handle" draggable={false} onMouseDown={(e) => startColumnResize(colKey, e)} />
                );
                const label = (board === "t1ho" ? COLUMN_LABELS[colKey].t1ho : COLUMN_LABELS[colKey].ho)[lang];
                if (colKey === "date") {
                  return (
                    <th key={colKey} className="sortable draggable-col" onClick={toggleDateSort} {...dragProps}>
                      {label} {dateSort === "desc" ? t(lang, "newestFirst") : dateSort === "asc" ? t(lang, "oldestFirst") : "↕"}
                      {resizeHandle}
                    </th>
                  );
                }
                return (
                  <th key={colKey} className="draggable-col" {...dragProps}>
                    {label}
                    {resizeHandle}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((c, i) => renderRow(c, `row-${i}`))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columnOrder.length} className="empty">
                  {t(lang, "noMatchingCases")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <div className="page-size-group">
          {t(lang, "perPage")}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
        <div className="page-nav">
          <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
            ‹
          </button>
          <span className="page-indicator">{t(lang, "pageIndicator", currentPage, totalPages)}</span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            ›
          </button>
        </div>
      </div>

      {lightbox && (
        <ImageLightbox url={lightbox.url} name={lightbox.fileName} onClose={() => setLightbox(null)} />
      )}

      {newCaseOpen && (
        <NewCaseModal
          board={board}
          lang={lang}
          optionLists={optionLists}
          currentUser={me}
          onClose={() => setNewCaseOpen(false)}
          onCreated={async () => {
            setNewCaseOpen(false);
            await refresh();
          }}
        />
      )}

      {linkTarget && (
        <LinkEditModal
          kind={linkTarget.kind}
          lang={lang}
          initialLabel={
            (linkTarget.kind === "ticket" ? linkCase?.relatedTicketLabel : linkCase?.noteLabel) ?? ""
          }
          initialUrl={(linkTarget.kind === "ticket" ? linkCase?.relatedTicketUrl : linkCase?.noteUrl) ?? ""}
          saving={linkSaving}
          error={linkError}
          onCancel={() => setLinkTarget(null)}
          onSave={saveLink}
        />
      )}
    </div>
  );
}
