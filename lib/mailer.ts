import "server-only";

// Sends the verification code by relaying through a Google Apps Script Web
// App (MailApp.sendEmail), which is free and needs no separate mail-sending
// service. `APPS_SCRIPT_SECRET` authenticates this call so the public Apps
// Script URL can't be used by anyone else to send arbitrary mail.
export async function sendVerificationCode(email: string, code: string): Promise<void> {
  const url = process.env.APPS_SCRIPT_MAIL_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !secret) {
    throw new Error("APPS_SCRIPT_MAIL_URL / APPS_SCRIPT_SECRET is not configured.");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, to: email, code }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to send verification email (HTTP ${res.status}).`);
  }
  const text = await res.text();
  if (text.trim() !== "ok") {
    throw new Error(`Verification email relay rejected the request: ${text}`);
  }
}
