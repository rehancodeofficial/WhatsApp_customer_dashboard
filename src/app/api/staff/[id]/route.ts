import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { deleteStaff, updateStaff, StaffError } from '@/lib/staff';

const PatchBody = z.object({
  full_name: z.string().min(1).max(100).optional(),
  role: z.enum(['owner', 'agent']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid change (passwords need 8+ characters)' }, { status: 400 });
  try {
    return NextResponse.json({ success: true, user: await updateStaff(v.id, id, parsed.data) });
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
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof StaffError ? e.status : 500 });
  }
}
