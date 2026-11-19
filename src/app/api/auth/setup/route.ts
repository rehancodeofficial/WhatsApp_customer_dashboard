import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isDemoMode } from '@/lib/config';
import { createStaff, listStaff, StaffError } from '@/lib/staff';
import { rateLimit } from '@/lib/rate-limit';

// First-run setup: while NO staff account exists yet, anyone opening /login can create the
// first Admin. As soon as one account exists this endpoint refuses, and new staff are added
// by an Admin from "Staff & Access".
async function needsSetup() {
  if (isDemoMode()) return false;
  return (await listStaff()).length === 0;
}

export async function GET() {
  try {
    return NextResponse.json({ needsSetup: await needsSetup() });
  } catch (e: any) {
    // e.g. migrations not run yet
    return NextResponse.json({ needsSetup: false, error: e.message }, { status: 500 });
  }
}

const Body = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rateLimit(`setup:${ip}`, 5, 10 * 60_000)) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  if (!(await needsSetup())) return NextResponse.json({ error: 'Setup is already done. Sign in instead.' }, { status: 409 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Fill in name, a valid email and a password of 8+ characters' }, { status: 400 });
  try {
    const user = await createStaff({ ...parsed.data, role: 'owner' });
    return NextResponse.json({ success: true, email: user.email });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof StaffError ? e.status : 500 });
  }
}
