import type { Permissions } from "./permissions";

// The sidebar's 預覽身份 switcher lives in the layout, so it survives
// navigation — but the board it's previewing gets torn down and rebuilt on
// every page switch, which used to drop the preview back to the admin's own
// permissions. Holding the choice in module scope keeps it across client-side
// navigation and clears it on a real reload, which is the behaviour we want:
// a preview is a temporary "what does Support see?", not a saved setting.
let previewRoleKey: string | null = null;
let previewPermissions: Permissions | null = null;

export function setRolePreview(roleKey: string | null, permissions: Permissions | null) {
  previewRoleKey = permissions ? roleKey : null;
  previewPermissions = permissions;
}

export function getRolePreviewKey(): string | null {
  return previewRoleKey;
}

export function getRolePreviewPermissions(): Permissions | null {
  return previewPermissions;
}
