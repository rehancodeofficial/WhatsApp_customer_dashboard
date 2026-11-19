import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { createStaff, listStaff, StaffError } from '@/lib/staff';

const CreateBody = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  role: z.enum(['owner', 'agent']),
  role_id: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  return NextResponse.json({ staff: await listStaff() });
}

export async function POST(req: NextRequest) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Fill in name, a valid email, a password of 8+ characters and a role' }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, user: await createStaff(parsed.data) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof StaffError ? e.status : 500 });
  }
}
