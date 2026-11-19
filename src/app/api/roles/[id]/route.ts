import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { deleteRole, updateRole, RoleError } from '@/lib/roles';

const Body = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(200).nullable().optional(),
  permissions: z.array(z.string()).max(50).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  try {
    return NextResponse.json({ role: await updateRole((await params).id, parsed.data) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof RoleError ? e.status : 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  try {
    await deleteRole((await params).id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof RoleError ? e.status : 500 });
  }
}
