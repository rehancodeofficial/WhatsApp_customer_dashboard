// Custom staff roles: the Admin names a role and ticks exactly which permissions it gets.
// Live mode: table `staff_roles`. Demo mode: in memory.
import { randomUUID } from 'crypto';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { MANAGEMENT_DEFAULT, sanitizePermissions, type GrantablePermission } from '@/lib/permissions';

export interface StaffRole {
  id: string;
  name: string;
  description: string | null;
  permissions: GrantablePermission[];
  created_at: string;
}

export class RoleError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const g = globalThis as unknown as { __pbDemoRoles?: StaffRole[] };
export const DEMO_MANAGEMENT_ROLE_ID = '00000000-0000-4000-8000-000000000001';

function demoRoles(): StaffRole[] {
  if (!g.__pbDemoRoles) {
    const now = new Date().toISOString();
    g.__pbDemoRoles = [
      { id: DEMO_MANAGEMENT_ROLE_ID, name: 'Management', description: 'Works the inbox: reads chats, replies, AI on/off', permissions: [...MANAGEMENT_DEFAULT], created_at: now },
      { id: randomUUID(), name: 'Viewer', description: 'Read-only: chat logs and records', permissions: ['chats.view', 'customers.view', 'inventory.view', 'orders.view', 'suppliers.view'], created_at: now },
      { id: randomUUID(), name: 'Inventory Clerk', description: 'Keeps stock and supplier records up to date', permissions: ['inventory.view', 'inventory.manage', 'suppliers.view', 'suppliers.manage', 'orders.view'], created_at: now },
    ];
  }
  return g.__pbDemoRoles;
}

export function resetDemoRoles() {
  g.__pbDemoRoles = undefined;
}

const clean = (r: any): StaffRole => ({ ...r, permissions: sanitizePermissions(r.permissions) });

export async function listRoles(): Promise<StaffRole[]> {
  if (isDemoMode()) return demoRoles().map(clean);
  const { data, error } = await getAdminSupabase().from('staff_roles').select('*').order('created_at');
  if (error) throw new RoleError(error.message, 500);
  return (data || []).map(clean);
}

export async function getRole(id: string | null | undefined): Promise<StaffRole | null> {
  if (!id) return null;
  if (isDemoMode()) return demoRoles().find((r) => r.id === id) ?? null;
  const { data } = await getAdminSupabase().from('staff_roles').select('*').eq('id', id).maybeSingle();
  return data ? clean(data) : null;
}

export async function createRole(input: { name: string; description?: string | null; permissions: string[] }): Promise<StaffRole> {
  const name = input.name.trim();
  if (!name) throw new RoleError('Enter a role name');
  if (name.toLowerCase() === 'admin') throw new RoleError('"Admin" is reserved for the owner');
  const permissions = sanitizePermissions(input.permissions);
  if (isDemoMode()) {
    if (demoRoles().some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new RoleError('A role with this name exists', 409);
    const r: StaffRole = { id: randomUUID(), name, description: input.description?.trim() || null, permissions, created_at: new Date().toISOString() };
    demoRoles().push(r);
    return r;
  }
  const { data, error } = await getAdminSupabase()
    .from('staff_roles')
    .insert({ name, description: input.description?.trim() || null, permissions })
    .select('*')
    .single();
  if (error) throw new RoleError(error.code === '23505' ? 'A role with this name exists' : error.message, error.code === '23505' ? 409 : 500);
  return clean(data);
}

export async function updateRole(id: string, changes: { name?: string; description?: string | null; permissions?: string[] }): Promise<StaffRole> {
  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) {
    if (!changes.name.trim()) throw new RoleError('Enter a role name');
    if (changes.name.trim().toLowerCase() === 'admin') throw new RoleError('"Admin" is reserved for the owner');
    patch.name = changes.name.trim();
  }
  if (changes.description !== undefined) patch.description = changes.description?.trim() || null;
  if (changes.permissions) patch.permissions = sanitizePermissions(changes.permissions);
  if (isDemoMode()) {
    const r = demoRoles().find((x) => x.id === id);
    if (!r) throw new RoleError('Role not found', 404);
    Object.assign(r, patch);
    return clean(r);
  }
  const { data, error } = await getAdminSupabase().from('staff_roles').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) throw new RoleError(error.message, 500);
  if (!data) throw new RoleError('Role not found', 404);
  return clean(data);
}

/** Users on a deleted role keep their account but lose every permission until given a new role. */
export async function deleteRole(id: string): Promise<void> {
  if (isDemoMode()) {
    g.__pbDemoRoles = demoRoles().filter((r) => r.id !== id);
    return;
  }
  const { error } = await getAdminSupabase().from('staff_roles').delete().eq('id', id);
  if (error) throw new RoleError(error.message, 500);
}
