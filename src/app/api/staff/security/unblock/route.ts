import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { requireOwnCode } from '@/lib/mfa';
import { ipOf, logActivity } from '@/lib/security';

// Admin: { userId, code } → lifts the block after 3 wrong passwords (the password stays the same).
export async function POST(req: NextRequest) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  const body = await req.json().catch(() => ({}));
  const codeErr = await requireOwnCode(body?.code);
  if (codeErr) return NextResponse.json({ error: codeErr, code_required: true }, { status: 403 });
  const id = String(body?.userId || '');
  const { error } = await getAdminSupabase().from('profiles').update({ locked_at: null, failed_logins: 0 }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(v, 'account.unblocked', { user_id: id }, ipOf(req));
  return NextResponse.json({ success: true });
}
