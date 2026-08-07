import "server-only";
import crypto from "crypto";

const CODE_TTL_SECONDS = 5 * 60;
const CODE_RESEND_COOLDOWN_SECONDS = 30;
const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function createToken(data: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function verifyToken<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;

  const expectedSig = sign(encoded);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString()) as T & { exp?: number };
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export interface PendingAuth {
  email: string;
  codeHash: string;
  issuedAt: number;
  exp: number;
}

export function isAllowedEmail(email: string): boolean {
  const domain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (!domain) return false;
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
  return trimmed.endsWith(`@${domain.toLowerCase()}`);
}

export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function createPendingToken(email: string, code: string): string {
  return createToken({
    email,
    codeHash: hashCode(code),
    issuedAt: Date.now(),
    exp: Date.now() + CODE_TTL_SECONDS * 1000,
  });
}

export function readPendingToken(token: string | undefined | null): PendingAuth | null {
  return verifyToken<PendingAuth>(token);
}

// Blocks re-sending a fresh code for the same pending verification within
// the cooldown window, so a slow double-click doesn't fire two emails.
export function isWithinResendCooldown(pending: PendingAuth): boolean {
  return Date.now() - pending.issuedAt < CODE_RESEND_COOLDOWN_SECONDS * 1000;
}

export function codeMatches(pending: PendingAuth, code: string): boolean {
  const hashBuf = Buffer.from(hashCode(code.trim()));
  const expectedBuf = Buffer.from(pending.codeHash);
  return hashBuf.length === expectedBuf.length && crypto.timingSafeEqual(hashBuf, expectedBuf);
}

export interface Session {
  email: string;
  exp: number;
}

export function createSessionToken(email: string): string {
  return createToken({ email, exp: Date.now() + SESSION_TTL_SECONDS * 1000 });
}

export function readSessionToken(token: string | undefined | null): Session | null {
  return verifyToken<Session>(token);
}

// The part of the verified email before "@" — used as the commenter's
// display name (e.g. "chen.wei@company.com" -> "chen.wei").
export function displayNameFromEmail(email: string): string {
  return email.split("@")[0];
}

export const SESSION_COOKIE = "t1ho_session";
export const PENDING_COOKIE = "t1ho_pending_auth";
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
export const PENDING_MAX_AGE = CODE_TTL_SECONDS;
