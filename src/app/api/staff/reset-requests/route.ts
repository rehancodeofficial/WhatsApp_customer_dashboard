import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { listPasswordResetRequests, fulfillPasswordResetRequest } from '@/lib/password-reset';
import { StaffError } from '@/lib/staff';

const FulfillBody = z.object({
  requestId: z.string().uuid(),
  newPassword: z.string().min(8).max(200),
  verificationNotes: z.string().max(300).optional(),
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

  try {
    const res = await fulfillPasswordResetRequest(
      v.id,
      parsed.data.requestId,
      parsed.data.newPassword,
      parsed.data.verificationNotes
    );
    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message },
      { status: e instanceof StaffError ? e.status : 500 }
    );
  }
}
