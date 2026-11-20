import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { requireCodeIfEnabled } from '@/lib/mfa';
import { ipOf, logActivity, recordPasswordChange } from '@/lib/security';

const Body = z.object({ current: z.string().min(1, 'Enter your current password').max(200), password: z.string().min(8, 'New password: at least 8 characters').max(200), code: z.string().max(10).optional() });

// Settings → Profile → Change password (checks the current password first).
export async function POST(req: NextRequest) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!rateLimit(`chpw:${v.id}`, 5, 10 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Wait 10 minutes.' }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message }, { status: 400 });
  // Separate client without cookies: only checks the password, does not touch the current session.
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: bad } = await check.auth.signInWithPassword({ email: v.email, password: p.data.current });
  if (bad) return NextResponse.json({ error: 'Current password is wrong' }, { status: 400 });
  // Two-factor on: also needs a current authenticator code.
  const codeErr = await requireCodeIfEnabled(p.data.code);
  if (codeErr) return NextResponse.json({ error: codeErr, code_required: true }, { status: 403 });
  const { error } = await getAdminSupabase().auth.admin.updateUserById(v.id, { password: p.data.password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await recordPasswordChange({ id: v.id, name: v.name, email: v.email, role: v.role }, p.data.password, v, 'changed their own password in Settings');
  await logActivity(v, 'password.changed', {}, ipOf(req));
  return NextResponse.json({ success: true });
}
