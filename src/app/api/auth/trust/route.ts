import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { TRUST_COOKIE, trustOk, TRUST_DAYS } from '@/lib/mfa-cookie';
import { logActivity } from '@/lib/security';

// Settings → Security: is this browser a trusted device?  DELETE → ask for the code again here.
export async function GET(req: NextRequest) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const raw = req.cookies.get(TRUST_COOKIE)?.value;
  const ok = await trustOk(raw, v.id);
  return NextResponse.json({ trusted: ok, until: ok ? Number(raw!.split('.')[1]) : null, days: TRUST_DAYS });
}

export async function DELETE() {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  await logActivity(v, 'security.device_forgotten', {});
  const res = NextResponse.json({ success: true });
  res.cookies.set(TRUST_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
