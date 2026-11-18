import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/config';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Viewer } from '@/lib/repo/types';

/** The logged-in dashboard user, or null. In demo mode everyone is the demo owner. */
export async function getViewer(): Promise<Viewer | null> {
  if (isDemoMode()) return { id: null, role: 'owner', name: 'Demo Owner' };
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await getAdminSupabase().from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  if (!profile) return null; // signed up but not added as staff
  return { id: user.id, role: profile.role === 'owner' ? 'owner' : 'agent', name: profile.full_name || user.email || 'Staff' };
}

export function unauthorized() {
  return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
}

/** Use in dashboard route handlers: returns the viewer or a 401 response. */
export async function requireViewer(): Promise<Viewer | NextResponse> {
  const v = await getViewer();
  return v ?? unauthorized();
}
