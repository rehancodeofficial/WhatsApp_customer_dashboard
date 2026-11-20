import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { clean, mfaState, sixDigits } from '@/lib/mfa';

// Settings → Security → "Turn off": needs a current code from the app.
export async function POST(req: NextRequest) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!sixDigits(body?.code)) return NextResponse.json({ error: 'Enter the current 6-digit code to turn it off' }, { status: 400 });
  const s = await mfaState();
  if (!s.factorId) return NextResponse.json({ success: true });
  const { error: vErr } = await s.supabase.auth.mfa.challengeAndVerify({ factorId: s.factorId, code: clean(body.code) });
  if (vErr) return NextResponse.json({ error: 'Wrong code' }, { status: 400 });
  for (const f of s.all) {
    const { error } = await s.supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
