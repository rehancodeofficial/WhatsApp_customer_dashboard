import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { requireOwnCode } from '@/lib/mfa';
import { decryptSecret, ipOf, logActivity } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';

// Admin: { userId, code } → that user's latest password. Needs a fresh authenticator code every time; logged.
export async function POST(req: NextRequest) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  if (!rateLimit(`reveal:${v.id}`, 20, 10 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Wait a few minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const codeErr = await requireOwnCode(body?.code);
  if (codeErr) return NextResponse.json({ error: codeErr, code_required: true }, { status: 403 });
  const { data } = await getAdminSupabase().from('staff_secrets').select('enc, updated_at').eq('user_id', String(body?.userId || '')).maybeSingle();
  if (!data) return NextResponse.json({ error: 'No password stored yet. It is saved the next time this password is set or changed.' }, { status: 404 });
  let password: string;
  try {
    password = decryptSecret(data.enc);
  } catch {
    return NextResponse.json({ error: 'The stored copy cannot be opened (the server key changed). Set a new password for this user.' }, { status: 500 });
  }
  await logActivity(v, 'password.viewed', { user_id: body.userId }, ipOf(req));
  return NextResponse.json({ password, updatedAt: data.updated_at });
}
