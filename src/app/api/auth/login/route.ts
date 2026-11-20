import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isDemoMode } from '@/lib/config';
import { demoAuthenticate } from '@/lib/staff';
import { DEMO_COOKIE, createDemoSession } from '@/lib/demo-session';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { getProfile, ipOf, logActivity, MAX_FAILED_LOGINS, recordFailedLogin, recordSuccessfulLogin, resolveLogin } from '@/lib/security';

// Sign in with the username (or, for older bookmarks, the email).
const Body = z.object({ username: z.string().trim().min(1).max(150).optional(), email: z.string().trim().max(150).optional(), password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rateLimit(`login:${ip}`, 10, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Wait 5 minutes and try again.' }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !(parsed.data.username || parsed.data.email)) return NextResponse.json({ error: 'Enter your username and password' }, { status: 400 });
  const login = (parsed.data.username || parsed.data.email)!;
  const { password } = parsed.data;

  if (isDemoMode()) {
    const user = demoAuthenticate(login, password);
    if (!user) return NextResponse.json({ error: 'Wrong email or password, or the account is deactivated' }, { status: 401 });
    const res = NextResponse.json({ success: true, role: user.role });
    const s = createDemoSession(user.id);
    res.cookies.set(DEMO_COOKIE, s.value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: s.maxAge });
    return res;
  }

  const ipAddr = ipOf(req);
  const account = await resolveLogin(login);
  const email = account?.email || (login.includes('@') ? login : '');
  if (!account) return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });
  // Blocked after 3 wrong passwords: stays blocked until an Admin unblocks it or sets a new password.
  const userId = account.userId;
  const before = userId ? await getProfile(userId) : null;
  if (before?.locked_at) {
    await logActivity({ id: before.id, name: before.full_name, email, role: before.role }, 'login.blocked_attempt', {}, ipAddr);
    return NextResponse.json({ error: BLOCKED_MSG(before.role), blocked: true }, { status: 423 });
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (userId) {
      const blocked = await recordFailedLogin(userId, email, ipAddr || '');
      if (blocked) return NextResponse.json({ error: BLOCKED_MSG(before?.role), blocked: true }, { status: 423 });
      const left = MAX_FAILED_LOGINS - ((before?.failed_logins || 0) + 1);
      return NextResponse.json({ error: `Wrong username or password. ${left} ${left === 1 ? 'try' : 'tries'} left before the account is blocked.` }, { status: 401 });
    }
    return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });
  }
  const { data: profile } = await getAdminSupabase().from('profiles').select('role, active, full_name, role_id, recovery_email').eq('id', data.user.id).maybeSingle();
  if (!profile || profile.active === false) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: 'This account has no dashboard access. Ask an Admin.' }, { status: 403 });
  }
  await recordSuccessfulLogin(data.user.id);
  await logActivity({ id: data.user.id, name: profile.full_name, email, role: profile.role }, 'login', {}, ipAddr);
  // Two-factor on: the password was right, now the app code is needed (login step 2).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    // The Admin may use a code sent to the recovery email instead of the app ("Use another method").
    const emailOption = profile.role === 'owner' && !!profile.recovery_email;
    return NextResponse.json({ success: true, mfa_required: true, email_option: emailOption });
  }
  return NextResponse.json({ success: true, role: profile.role });
}

const BLOCKED_MSG = (role?: string | null) =>
  role === 'owner'
    ? 'This account is blocked after 3 wrong passwords. Use "Forgot password?" to get a reset link by email.'
    : 'This account is blocked after 3 wrong passwords. Ask the Admin to unblock it or set a new password.';
