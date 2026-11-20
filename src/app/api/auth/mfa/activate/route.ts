import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { clean, mfaState, sixDigits } from '@/lib/mfa';
import { logActivity } from '@/lib/security';

// Settings → Security: { factorId, code } confirms the app is set up; from now on sign-in asks for a code.
export async function POST(req: NextRequest) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body?.factorId || !sixDigits(body?.code)) return NextResponse.json({ error: 'Enter the 6-digit code shown in the app' }, { status: 400 });
  const s = await mfaState();
  const { error } = await s.supabase.auth.mfa.challengeAndVerify({ factorId: String(body.factorId), code: clean(body.code) });
  if (error) return NextResponse.json({ error: 'Wrong code. Check the time on your phone and try the current code.' }, { status: 400 });
  await logActivity(v, 'security.2fa_on', {});
  return NextResponse.json({ success: true });
}
