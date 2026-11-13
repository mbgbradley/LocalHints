/**
 * Business-owner password hashing (prototype, runs in the browser).
 *
 * Passwords are never stored: we keep a random per-account salt and a PBKDF2-SHA256 hash
 * (210,000 iterations, the OWASP 2023 minimum for PBKDF2-SHA256). This needs the Web Crypto API,
 * which browsers only expose on HTTPS or localhost.
 *
 * Production: replace with Supabase Auth (or similar). The server must own business sessions.
 * Admin sign-in is already server-side: see lib/adminAuth.ts and app/api/admin/*.
 */

const ITERATIONS = 210_000;

export const SECURE_CONTEXT_MESSAGE =
  'Secure sign-in needs HTTPS or localhost. Open the app from your Vercel link, or http://localhost:3000 on this computer.';

function subtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new Error(SECURE_CONTEXT_MESSAGE);
  return crypto.subtle;
}

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const s = subtle();
  const key = await s.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await s.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(password, salt) };
}

/** Constant-time string comparison so response timing does not leak how many characters matched. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const candidate = await derive(password, fromHex(salt));
  return safeEqual(candidate, hash);
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Mix letters and numbers.';
  return null;
}
