import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { listPasswordResetRequests, fulfillPasswordResetRequest } from '@/lib/password-reset';
import { StaffError } from '@/lib/staff';
import { logActivity, recordPasswordChange } from '@/lib/security';
import { requireOwnCode } from '@/lib/mfa';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listStaff } from '@/lib/staff';

const FulfillBody = z.object({
  requestId: z.string().uuid(),
  newPassword: z.string().min(8).max(200),
  verificationNotes: z.string().max(300).optional(),
  code: z.string().max(10).optional(),
});

export async function GET() {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;

  try {
    const requests = await listPasswordResetRequests();
    return NextResponse.json({ requests });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;

  const parsed = FulfillBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please provide request ID and a password of at least 8 characters.' }, { status: 400 });
  }

  // Setting someone's password needs the Admin's authenticator code.
  const codeErr = await requireOwnCode(parsed.data.code);
  if (codeErr) return NextResponse.json({ error: codeErr, code_required: true }, { status: 403 });

  try {
    const res = await fulfillPasswordResetRequest(
      v.id,
      parsed.data.requestId,
      parsed.data.newPassword,
      parsed.data.verificationNotes
    );
    const target = (await listStaff()).find((u) => u.id === res.request.user_id);
    if (target) {
      await getAdminSupabase().from('profiles').update({ failed_logins: 0, locked_at: null }).eq('id', target.id);
      await recordPasswordChange({ id: target.id, name: target.full_name, email: target.email, role: target.role }, parsed.data.newPassword, v, `got a new password from ${v.name} (reset request)`);
    }
    await logActivity(v, 'staff.reset_request_completed', { email: target?.email });
    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message },
      { status: e instanceof StaffError ? e.status : 500 }
    );
  }
}
