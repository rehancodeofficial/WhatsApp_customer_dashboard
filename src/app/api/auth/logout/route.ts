import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/config';
import { DEMO_COOKIE } from '@/lib/demo-session';
import { createServerSupabase } from '@/lib/supabase/server';
import { logActivity } from '@/lib/security';
import { getViewer } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ success: true });
  if (isDemoMode()) {
    res.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }
  const v = await getViewer().catch(() => null);
  if (v) await logActivity(v, 'logout', {});
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  return res;
}
