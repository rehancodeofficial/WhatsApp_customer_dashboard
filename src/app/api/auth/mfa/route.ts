import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/config';
import { getViewer } from '@/lib/auth';
import { mfaState } from '@/lib/mfa';

// GET → { enabled } for the signed-in user (Settings → Security).
export async function GET() {
  if (isDemoMode()) return NextResponse.json({ enabled: false, demo: true });
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const s = await mfaState();
  return NextResponse.json({ enabled: s.enabled });
}
