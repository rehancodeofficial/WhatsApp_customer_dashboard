import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { clean, sixDigits } from '@/lib/mfa';
import { getProfile, ipOf, logActivity, recordFailedLogin, recordPasswordChange, resolveLogin } from '@/lib/security';

// Forgot password, for anyone with Microsoft Authenticator on: email + current 6-digit code + new password.
// The code is checked by Supabase MFA on a one-off session (magic-link token made on the server, never emailed).
// A wrong code counts as a failed sign-in (3 → blocked). A blocked account cannot reset itself: the Admin must.
const Body = z.object({
  // username (preferred) or email
  email: z.string().trim().min(1, 'Enter your username').max(150),
  code: z.string().max(10),
  password: z.string().min(8, 'New password: at least 8 characters').max(200),
});

export async function POST(req: NextRequest) {
  if (isDemoMode()) return NextResponse.json({ error: 'Not available in demo mode' }, { status: 400 });
  const ip = ipOf(req) || 'local';
  if (!rateLimit(`reset-code:${ip}`, 8, 10 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Wait 10 minutes.' }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message }, { status: 400 });
  if (!sixDigits(p.data.code)) return NextResponse.json({ error: 'Enter the 6-digit code from Microsoft Authenticator' }, { status: 400 });
  const generic = 'This account cannot be reset with an authenticator code. Ask the Admin.';
  const acct = await resolveLogin(p.data.email);
  const email = acct?.email || '';
  const userId = acct?.userId || null;
  const prof = userId ? await getProfile(userId) : null;
  if (!userId || !prof || prof.active === false) return NextResponse.json({ error: generic }, { status: 400 });
  if (prof.locked_at) return NextResponse.json({ error: 'This account is blocked after 3 wrong attempts. Only the Admin can unblock it.', blocked: true }, { status: 423 });

  const admin = getAdminSupabase();
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId });
  const totp = (factors?.factors || []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (!totp) return NextResponse.json({ error: 'Microsoft Authenticator is not set up for this account. Ask the Admin to reset your password.' }, { status: 400 });

  // One-off session for this user (aal1), only to let Supabase check the authenticator code.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link?.properties?.hashed_token) return NextResponse.json({ error: 'Could not start the reset. Try again.' }, { status: 500 });
  const tmp = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: otpErr } = await tmp.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (otpErr) return NextResponse.json({ error: 'Could not start the reset. Try again.' }, { status: 500 });
  const { error: codeErr } = await tmp.auth.mfa.challengeAndVerify({ factorId: totp.id, code: clean(p.data.code) });
  await tmp.auth.signOut().catch(() => {});
  if (codeErr) {
    const blocked = await recordFailedLogin(userId, email, ip, 'authenticator code');
    return NextResponse.json(
      { error: blocked ? 'This account is now blocked after 3 wrong attempts. Only the Admin can unblock it.' : 'Wrong or expired authenticator code.', blocked },
      { status: blocked ? 423 : 400 }
    );
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password: p.data.password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from('profiles').update({ failed_logins: 0 }).eq('id', userId);
  const who = { id: userId, name: prof.full_name, email, role: prof.role };
  await recordPasswordChange(who, p.data.password, who, 'reset their password with Microsoft Authenticator');
  await logActivity(who, 'password.reset_authenticator', {}, ip);
  return NextResponse.json({ success: true });
}
