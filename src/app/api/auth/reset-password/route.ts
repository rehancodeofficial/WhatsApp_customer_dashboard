import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { checkResetToken, completeOwnerReset } from '@/lib/owner-reset';

// GET ?token=… → is the link still valid?   POST { token, password } → sets the new password.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) return NextResponse.json({ valid: false, reason: 'missing' });
  return NextResponse.json(await checkResetToken(token));
}

const Body = z.object({ token: z.string().min(20).max(200), password: z.string().min(8, 'Use at least 8 characters').max(200) });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rateLimit(`reset-pw:${ip}`, 10, 10 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Wait 10 minutes.' }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message || 'Invalid request' }, { status: 400 });
  try {
    return NextResponse.json(await completeOwnerReset(p.data.token, p.data.password));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
