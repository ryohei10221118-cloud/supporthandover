/**
 * Accounts no person is behind. Client-safe on purpose: the board renders
 * these names too, and lib/auth.ts is server-only.
 */

/**
 * Author of everything the Sheet import brings across. Nobody signs in as
 * this, and nobody could — the domain is reserved as unroutable, so a
 * verification code could never arrive.
 *
 * It exists because the alternative is attributing a migrated reply to
 * whoever happened to run the import, which reads as though they wrote it.
 * The sheet has no author column — the real name is usually inside the reply
 * text itself — so naming the import is the honest answer.
 */
export const SHEET_IMPORT_EMAIL = "sheet-import@system.invalid";

const SYSTEM_DISPLAY_NAMES: Record<string, string> = {
  [SHEET_IMPORT_EMAIL]: "Sheet 匯入",
};

/** The fixed label for a system account, or null for a real person's email. */
export function systemDisplayName(email: string): string | null {
  return SYSTEM_DISPLAY_NAMES[email] ?? null;
}
