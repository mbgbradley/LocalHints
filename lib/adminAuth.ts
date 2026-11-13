import 'server-only';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

/**
 * Server-side admin authentication.
 *
 * - Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD (default Admin / Admin for the demo).
 * - Checks use SHA-256 digests + timingSafeEqual, so timing does not reveal matching characters.
 * - A successful login sets an HttpOnly, SameSite=Strict, signed (HMAC-SHA256) cookie that expires in
 *   8 hours. The browser's JavaScript can never read it, and it cannot be forged without SESSION_SECRET.
 * - Failed logins are rate limited per IP (best effort: memory is per serverless instance).
 *
 * CHANGE THE DEFAULTS before sharing a public URL: set ADMIN_PASSWORD and SESSION_SECRET in Vercel.
 */

export const ADMIN_COOKIE = 'lh_admin';
export const SESSION_SECONDS = 8 * 60 * 60;

const DEFAULT_USER = 'Admin';
const DEFAULT_PASSWORD = 'Admin';
const DEV_SECRET = 'localhints-dev-secret-change-me';

const adminUser = (): string => process.env.ADMIN_USERNAME ?? DEFAULT_USER;
const adminPassword = (): string => process.env.ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
const secret = (): string => process.env.SESSION_SECRET ?? DEV_SECRET;

/** True while the well-known demo credentials or signing secret are still in use. */
export function usingDefaults(): boolean {
  return (
    adminUser() === DEFAULT_USER && adminPassword() === DEFAULT_PASSWORD
  ) || secret() === DEV_SECRET;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function credentialsMatch(username: string, password: string): boolean {
  // Evaluate both so timing does not reveal which one was wrong.
  const userOk = timingSafeEqual(digest(username.trim()), digest(adminUser()));
  const passOk = timingSafeEqual(digest(password), digest(adminPassword()));
  return userOk && passOk;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'admin', exp: now + SESSION_SECONDS * 1000 }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    return data.sub === 'admin' && typeof data.exp === 'number' && data.exp > now;
  } catch {
    return false;
  }
}

// --- Login rate limiting (5 failures per 15 minutes per IP) -----------------------------------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

export function rateLimited(ip: string, now = Date.now()): boolean {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (now - entry.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordFailure(ip: string, now = Date.now()): void {
  const entry = failures.get(ip);
  if (!entry || now - entry.first > WINDOW_MS) failures.set(ip, { count: 1, first: now });
  else entry.count += 1;
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}
