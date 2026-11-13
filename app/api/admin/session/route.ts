import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, usingDefaults, verifySessionToken } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const authenticated = verifySessionToken(cookies().get(ADMIN_COOKIE)?.value);
  return NextResponse.json(
    { authenticated, usingDefaults: authenticated ? usingDefaults() : false },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
