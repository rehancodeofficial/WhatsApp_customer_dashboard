import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { clean, mfaState, sixDigits } from '@/lib/mfa';

// Login step 2: { code } from the authenticator app upgrades the session to aal2.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rateLimit(`mfa:${ip}`, 10, 5 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Wait 5 minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (!sixDigits(body?.code)) return NextResponse.json({ error: 'Enter the 6-digit code from Microsoft Authenticator' }, { status: 400 });
  const s = await mfaState();
  const { data: user } = await s.supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: 'Your sign-in expired. Enter your password again.' }, { status: 401 });
  if (!s.factorId) return NextResponse.json({ success: true });
  const { error } = await s.supabase.auth.mfa.challengeAndVerify({ factorId: s.factorId, code: clean(body.code) });
  if (error) return NextResponse.json({ error: 'Wrong or expired code. Try the current code in the app.' }, { status: 401 });
  return NextResponse.json({ success: true });
}
