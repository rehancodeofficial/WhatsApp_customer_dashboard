import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { maskEmail } from '@/lib/owner-reset';
import { resolveLogin } from '@/lib/security';

// Forgot password, step 1: { username } → which ways this account can reset its password.
//   Admin: link to the recovery email, or Microsoft Authenticator (when set up)
//   Staff: Microsoft Authenticator (when set up), or a request to the Admin
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rateLimit(`forgot-opt:${ip}`, 15, 10 * 60_000)) return NextResponse.json({ error: 'Too many requests. Wait 10 minutes.' }, { status: 429 });
  const username = String((await req.json().catch(() => ({})))?.username || '').trim();
  if (!username) return NextResponse.json({ error: 'Enter your username' }, { status: 400 });
  const acct = await resolveLogin(username);
  if (!acct) return NextResponse.json({ error: 'No account with this username.' }, { status: 404 });
  const db = getAdminSupabase();
  const { data: p } = await db.from('profiles').select('role, active, recovery_email').eq('id', acct.userId).maybeSingle();
  if (!p || p.active === false) return NextResponse.json({ error: 'This account is deactivated. Ask the Admin.' }, { status: 403 });
  const { data: f } = await db.auth.admin.mfa.listFactors({ userId: acct.userId });
  const authenticator = (f?.factors || []).some((x) => x.factor_type === 'totp' && x.status === 'verified');
  if (p.role === 'owner') {
    return NextResponse.json({ kind: 'owner', authenticator, recoveryEmail: p.recovery_email ? maskEmail(p.recovery_email) : null });
  }
  return NextResponse.json({ kind: 'staff', authenticator });
}
