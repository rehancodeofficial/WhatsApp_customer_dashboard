import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { createRole, listRoles, RoleError } from '@/lib/roles';

const Body = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(200).nullable().optional(),
  permissions: z.array(z.string()).max(50),
});

export async function GET() {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  return NextResponse.json({ roles: await listRoles() });
}

export async function POST(req: NextRequest) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a role name and pick permissions' }, { status: 400 });
  try {
    return NextResponse.json({ role: await createRole(parsed.data) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof RoleError ? e.status : 500 });
  }
}
