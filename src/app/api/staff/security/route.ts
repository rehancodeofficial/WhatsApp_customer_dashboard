import { NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listStaff } from '@/lib/staff';
import { getRole } from '@/lib/roles';

// Admin: every account with status, two-factor, password last changed, last login. Passwords are not sent here.
export async function GET() {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  const staff = await listStaff();
  if (isDemoMode()) return NextResponse.json({ users: staff.map((u) => ({ ...u, roleLabel: u.role === 'owner' ? 'Admin' : 'Staff', status: u.active ? 'active' : 'deactivated', mfa: false, hasPassword: false })) });
  const db = getAdminSupabase();
  const { data: profs } = await db.from('profiles').select('id, failed_logins, locked_at, password_changed_at, last_login_at');
  const { data: secrets } = await db.from('staff_secrets').select('user_id, updated_at');
  const users = await Promise.all(
    staff.map(async (u) => {
      const p = profs?.find((x) => x.id === u.id);
      const { data: f } = await db.auth.admin.mfa.listFactors({ userId: u.id });
      const role = u.role === 'owner' ? null : await getRole(u.role_id);
      return {
        id: u.id,
        name: u.full_name,
        email: u.email,
        username: u.username ?? null,
        whatsapp: u.whatsapp ?? null,
        role: u.role,
        roleLabel: u.role === 'owner' ? 'Admin' : role?.name || 'Staff',
        status: !u.active ? 'deactivated' : p?.locked_at ? 'blocked' : 'active',
        lockedAt: p?.locked_at ?? null,
        failedLogins: p?.failed_logins ?? 0,
        mfa: (f?.factors || []).some((x) => x.factor_type === 'totp' && x.status === 'verified'),
        passwordChangedAt: p?.password_changed_at ?? secrets?.find((s) => s.user_id === u.id)?.updated_at ?? null,
        lastLoginAt: p?.last_login_at ?? u.last_sign_in_at ?? null,
        hasPassword: !!secrets?.some((s) => s.user_id === u.id),
      };
    })
  );
  return NextResponse.json({ users });
}
