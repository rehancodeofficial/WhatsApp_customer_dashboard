import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isDemoMode } from '@/lib/config';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { DEMO_COOKIE, readDemoSession } from '@/lib/demo-session';
import { demoFindStaff } from '@/lib/staff';
import { can, type Permission } from '@/lib/permissions';
import type { Viewer } from '@/lib/repo/types';

export interface SessionViewer extends Viewer {
  id: string;
  email: string;
  name: string;
}

/** The logged-in, active staff member, or null. */
export async function getViewer(): Promise<SessionViewer | null> {
  if (isDemoMode()) {
    const uid = readDemoSession((await cookies()).get(DEMO_COOKIE)?.value);
    const u = uid ? demoFindStaff(uid) : null;
    if (!u || !u.active) return null;
    return { id: u.id, role: u.role, name: u.full_name, email: u.email };
  }
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await getAdminSupabase().from('profiles').select('role, full_name, active').eq('id', user.id).maybeSingle();
  if (!profile || profile.active === false) return null; // not staff, or deactivated by an Admin
  return { id: user.id, role: profile.role === 'owner' ? 'owner' : 'agent', name: profile.full_name || user.email || 'Staff', email: user.email || '' };
}

/** Route-handler guard: returns the viewer, or a 401/403 response. */
export async function requireViewer(permission: Permission = 'chats.view'): Promise<SessionViewer | NextResponse> {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(v.role, permission)) return NextResponse.json({ error: 'Only an Admin can do this' }, { status: 403 });
  return v;
}
