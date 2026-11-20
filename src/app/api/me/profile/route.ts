import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { requireCodeIfEnabled } from '@/lib/mfa';

// Settings → Profile: own name, and (Admin only) the recovery email for password reset links.
export async function GET() {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ name: v.name, email: v.email, role: v.role, recovery_email: null });
  const { data } = await getAdminSupabase().from('profiles').select('full_name, recovery_email').eq('id', v.id).maybeSingle();
  return NextResponse.json({ name: data?.full_name || v.name, email: v.email, role: v.role, recovery_email: data?.recovery_email ?? null });
}

const Body = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(120).optional(),
  recovery_email: z.union([z.string().trim().email('Enter a valid recovery email'), z.literal('')]).optional(),
  code: z.string().max(10).optional(),
});

export async function PATCH(req: NextRequest) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ success: true });
  // Two-factor on: any profile change needs a current authenticator code.
  const codeErr = await requireCodeIfEnabled(p.data.code);
  if (codeErr) return NextResponse.json({ error: codeErr, code_required: true }, { status: 403 });
  const patch: Record<string, unknown> = {};
  if (p.data.name !== undefined) patch.full_name = p.data.name;
  if (p.data.recovery_email !== undefined) {
    if (v.role !== 'owner') return NextResponse.json({ error: 'Only the Admin has a recovery email' }, { status: 403 });
    patch.recovery_email = p.data.recovery_email || null;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ success: true });
  const { error } = await getAdminSupabase().from('profiles').update(patch).eq('id', v.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
