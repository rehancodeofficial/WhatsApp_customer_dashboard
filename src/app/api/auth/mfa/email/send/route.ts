import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { maskEmail } from '@/lib/owner-reset';
import { CODE_MINUTES, sendEmailCode } from '@/lib/email-codes';
import { ipOf, logActivity } from '@/lib/security';

// Admin sign-in step 2 without the app: { email } must be the Admin's recovery email; a code goes there.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'Your sign-in expired. Enter your password again.' }, { status: 401 });
  if (!rateLimit(`mfa-email:${data.user.id}`, 5, 15 * 60_000)) return NextResponse.json({ error: 'Too many codes asked. Wait 15 minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const typed = String(body?.email || '').trim().toLowerCase();
  const { data: p } = await getAdminSupabase().from('profiles').select('full_name, role, recovery_email, locked_at').eq('id', data.user.id).maybeSingle();
  if (!p || p.role !== 'owner' || !p.recovery_email) return NextResponse.json({ error: 'This option is only for the Admin.' }, { status: 403 });
  if (p.locked_at) return NextResponse.json({ error: 'This account is blocked. Use "Forgot password?" to reset it by email.' }, { status: 423 });
  if (typed !== String(p.recovery_email).toLowerCase()) {
    await logActivity({ id: data.user.id, name: p.full_name, email: data.user.email, role: p.role }, 'login.recovery_email_wrong', {}, ipOf(req));
    return NextResponse.json({ error: 'This is not the recovery email saved for this account.' }, { status: 400 });
  }
  try {
    await sendEmailCode(data.user.id, p.recovery_email, 'login', p.full_name || 'Admin');
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
  return NextResponse.json({ sent: true, to: maskEmail(p.recovery_email), minutes: CODE_MINUTES });
}
