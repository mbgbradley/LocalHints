import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_COOKIE,
  SESSION_SECONDS,
  clearFailures,
  createSessionToken,
  credentialsMatch,
  rateLimited,
  recordFailure,
  usingDefaults,
} from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 },
    );
  }

  let body: { username?: unknown; password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!credentialsMatch(username, password)) {
    recordFailure(ip);
    // Same message for a wrong username or password.
    return NextResponse.json({ ok: false, error: 'Incorrect username or password.' }, { status: 401 });
  }

  clearFailures(ip);
  const res = NextResponse.json({ ok: true, usingDefaults: usingDefaults() });
  res.cookies.set(ADMIN_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
  return res;
}
