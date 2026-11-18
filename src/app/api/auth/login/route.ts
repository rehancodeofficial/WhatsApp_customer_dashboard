import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isDemoMode } from '@/lib/config';
import { demoAuthenticate } from '@/lib/staff';
import { DEMO_COOKIE, createDemoSession } from '@/lib/demo-session';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';

const Body = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rateLimit(`login:${ip}`, 10, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Wait 5 minutes and try again.' }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your email and password' }, { status: 400 });
  const { email, password } = parsed.data;

  if (isDemoMode()) {
    const user = demoAuthenticate(email, password);
    if (!user) return NextResponse.json({ error: 'Wrong email or password, or the account is deactivated' }, { status: 401 });
    const res = NextResponse.json({ success: true, role: user.role });
    const s = createDemoSession(user.id);
    res.cookies.set(DEMO_COOKIE, s.value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: s.maxAge });
    return res;
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return NextResponse.json({ error: 'Wrong email or password' }, { status: 401 });
  const { data: profile } = await getAdminSupabase().from('profiles').select('role, active').eq('id', data.user.id).maybeSingle();
  if (!profile || profile.active === false) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: 'This account has no dashboard access. Ask an Admin.' }, { status: 403 });
  }
  return NextResponse.json({ success: true, role: profile.role });
}
