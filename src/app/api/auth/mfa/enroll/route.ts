import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { mfaState } from '@/lib/mfa';

// Settings → Security → "Set up": returns a QR code for Microsoft Authenticator. Not active until /activate.
export async function POST() {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const s = await mfaState();
  if (s.enabled) return NextResponse.json({ error: 'Two-factor sign-in is already on.' }, { status: 400 });
  // Remove half-finished setups so a new QR code can be made.
  for (const f of s.all.filter((f) => f.status !== 'verified')) await s.supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await s.supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}`, issuer: 'Phone Buzz Dashboard' });
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not start the setup' }, { status: 500 });
  return NextResponse.json({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
}
