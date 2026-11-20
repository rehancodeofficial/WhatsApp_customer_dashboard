import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isDemoMode } from '@/lib/config';
import { EMAIL_MFA_COOKIE, emailMfaOk, passwordEpoch, TRUST_COOKIE, trustOk } from '@/lib/mfa-cookie';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { DEMO_COOKIE, readDemoSession } from '@/lib/demo-session';
import { demoFindStaff } from '@/lib/staff';
import { can, type Permission } from '@/lib/permissions';
import { getRole } from '@/lib/roles';
import type { Viewer } from '@/lib/repo/types';

export interface SessionViewer extends Viewer {
  id: string;
  email: string;
  name: string;
  roleName: string | null;
  permissions: string[];
}

/** The logged-in, active staff member, or null. */
export async function getViewer(): Promise<SessionViewer | null> {
  if (isDemoMode()) {
    const uid = readDemoSession((await cookies()).get(DEMO_COOKIE)?.value);
    const u = uid ? demoFindStaff(uid) : null;
    if (!u || !u.active) return null;
    const r = u.role === 'owner' ? null : await getRole(u.role_id);
    return { id: u.id, role: u.role, name: u.full_name, email: u.email, roleName: r?.name ?? null, permissions: r?.permissions ?? [] };
  }
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // Two-factor on, but the 6-digit code not entered yet: not signed in.
  const { data: profile } = await getAdminSupabase().from('profiles').select('role, role_id, full_name, active, locked_at, password_changed_at').eq('id', user.id).maybeSingle();
  if (!profile || profile.active === false) return null; // not staff, or deactivated by an Admin
  if (profile.locked_at) return null; // blocked after 3 wrong passwords
  // Two-factor on, but no code entered on this sign-in: allowed only with an email code (Admin) or a
  // trusted device (3 days, ended by a password change).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    const jar = await cookies();
    const ok =
      (await emailMfaOk(jar.get(EMAIL_MFA_COOKIE)?.value, user.id)) ||
      (await trustOk(jar.get(TRUST_COOKIE)?.value, user.id, passwordEpoch(profile.password_changed_at)));
    if (!ok) return null;
  }
  const role = profile.role === 'owner' ? 'owner' : 'agent';
  const r = role === 'owner' ? null : await getRole(profile.role_id);
  return {
    id: user.id,
    role,
    name: profile.full_name || user.email || 'Staff',
    email: user.email || '',
    roleName: r?.name ?? null,
    permissions: r?.permissions ?? [],
  };
}

/** Route-handler guard: returns the viewer, or a 401/403 response. */
export async function requireViewer(permission: Permission = 'chats.view'): Promise<SessionViewer | NextResponse> {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(v, permission)) return NextResponse.json({ error: 'You do not have permission to do this' }, { status: 403 });
  return v;
}
