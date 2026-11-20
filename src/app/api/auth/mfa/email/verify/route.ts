import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { checkEmailCode } from '@/lib/email-codes';
import { EMAIL_MFA_COOKIE, EMAIL_MFA_HOURS, makeEmailMfaCookie } from '@/lib/mfa-cookie';
import { rememberDevice } from '@/lib/trust-device';
import { getProfile, ipOf, logActivity, recordFailedLogin, recordSuccessfulLogin } from '@/lib/security';

// Admin sign-in step 2 without the app: { code } from the recovery email finishes the sign-in.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'Your sign-in expired. Enter your password again.' }, { status: 401 });
  if (!rateLimit(`mfa-email-verify:${data.user.id}`, 10, 10 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Wait 10 minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Enter the 6-digit code from the email' }, { status: 400 });
  const p = await getProfile(data.user.id);
  if (!p || p.role !== 'owner') return NextResponse.json({ error: 'This option is only for the Admin.' }, { status: 403 });
  if (p.locked_at) return NextResponse.json({ error: 'This account is blocked. Use "Forgot password?" to reset it by email.', blocked: true }, { status: 423 });
  const r = await checkEmailCode(data.user.id, 'login', code);
  if (r !== 'ok') {
    if (r === 'wrong') {
      const blocked = await recordFailedLogin(data.user.id, data.user.email || '', ipOf(req) || '', 'email code');
      if (blocked) {
        await supabase.auth.signOut();
        return NextResponse.json({ error: 'This account is blocked after 3 wrong attempts. Use "Forgot password?" to reset it by email.', blocked: true }, { status: 423 });
      }
    }
    const msg = { wrong: 'Wrong code. Check the latest email.', expired: 'This code has expired. Send a new one.', none: 'Send a code first.', too_many: 'Too many wrong codes. Send a new one.' }[r];
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  await recordSuccessfulLogin(data.user.id);
  await logActivity({ id: data.user.id, name: p.full_name, email: data.user.email, role: p.role }, 'login.email_code', {}, ipOf(req));
  const res = NextResponse.json({ success: true });
  res.cookies.set(EMAIL_MFA_COOKIE, await makeEmailMfaCookie(data.user.id), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: EMAIL_MFA_HOURS * 3600 });
  if (body?.remember) await rememberDevice(res, data.user.id);
  return res;
}
