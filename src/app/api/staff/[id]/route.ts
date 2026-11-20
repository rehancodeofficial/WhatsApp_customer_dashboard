import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { deleteStaff, updateStaff, StaffError } from '@/lib/staff';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { requireOwnCode } from '@/lib/mfa';
import { logActivity, recordPasswordChange } from '@/lib/security';

const PatchBody = z.object({
  full_name: z.string().min(1).max(100).optional(),
  role: z.enum(['owner', 'agent']).optional(),
  role_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  code: z.string().max(10).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid change (passwords need 8+ characters)' }, { status: 400 });
  try {
    // A new password from the Admin needs the Admin's authenticator code and also unblocks the account.
    if (parsed.data.password) {
      const codeErr = await requireOwnCode((parsed.data as any).code);
      if (codeErr) return NextResponse.json({ error: codeErr, code_required: true }, { status: 403 });
    }
    const user = await updateStaff(v.id, id, parsed.data);
    if (parsed.data.password) {
      await getAdminSupabase().from('profiles').update({ failed_logins: 0, locked_at: null }).eq('id', id);
      await recordPasswordChange({ id, name: user.full_name, email: user.email, role: user.role }, parsed.data.password, v, `got a new password from ${v.name}`);
    }
    const { password, code, ...rest } = parsed.data as any;
    await logActivity(v, 'staff.updated', { email: user.email, ...rest, ...(password ? { password: 'changed' } : {}) });
    return NextResponse.json({ success: true, user });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof StaffError ? e.status : 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  const { id } = await params;
  try {
    await deleteStaff(v.id, id);
    await logActivity(v, 'staff.deleted', { id });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof StaffError ? e.status : 500 });
  }
}
