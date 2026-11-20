// Staff accounts (Admin / Management): list, create, change role, deactivate, reset password, delete.
// Live mode uses Supabase Auth + the `profiles` table. Demo mode keeps accounts in memory.
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Role } from '@/lib/permissions';
import { DEMO_MANAGEMENT_ROLE_ID } from '@/lib/roles';

export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  /** Custom role for non-Admin users (decides their permissions). */
  role_id: string | null;
  active: boolean;
  created_at: string;
  last_sign_in_at?: string | null;
  /** Sign-in name (unique, lower case). */
  username?: string | null;
}

export class StaffError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---------------- demo (in-memory) ----------------
interface DemoStaff extends StaffUser {
  hash: string;
}
const g = globalThis as unknown as { __pbDemoStaff?: DemoStaff[] };

function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}
function verifyPassword(pw: string, stored: string) {
  const [salt, hex] = stored.split(':');
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const DEMO_ACCOUNTS = [
  { email: 'admin@phonebuzz.demo', password: 'Admin@123', full_name: 'Demo Admin', role: 'owner' as Role },
  { email: 'management@phonebuzz.demo', password: 'Manage@123', full_name: 'Demo Management', role: 'agent' as Role },
];

function demoStaff(): DemoStaff[] {
  if (!g.__pbDemoStaff) {
    g.__pbDemoStaff = DEMO_ACCOUNTS.map((a) => ({
      id: randomUUID(),
      email: a.email,
      full_name: a.full_name,
      role: a.role,
      role_id: a.role === 'owner' ? null : DEMO_MANAGEMENT_ROLE_ID,
      active: true,
      created_at: new Date().toISOString(),
      last_sign_in_at: null,
      hash: hashPassword(a.password),
    }));
  }
  return g.__pbDemoStaff;
}
const strip = ({ hash: _h, ...u }: DemoStaff): StaffUser => u;

export function resetDemoStaff() {
  g.__pbDemoStaff = undefined;
}

/** Demo login: returns the user when email + password match an active account. */
export function demoAuthenticate(email: string, password: string): StaffUser | null {
  const u = demoStaff().find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u || !u.active || !verifyPassword(password, u.hash)) return null;
  u.last_sign_in_at = new Date().toISOString();
  return strip(u);
}

export function demoFindStaff(id: string): StaffUser | null {
  const u = demoStaff().find((x) => x.id === id);
  return u ? strip(u) : null;
}

// ---------------- shared rules ----------------
function validEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function checkPassword(pw: string) {
  if (pw.length < 8) throw new StaffError('Password must be at least 8 characters');
}
async function assertNotLastAdmin(id: string, list: StaffUser[]) {
  const admins = list.filter((u) => u.role === 'owner' && u.active);
  if (admins.length === 1 && admins[0].id === id) {
    throw new StaffError('This is the only active Admin. Make someone else Admin first.', 409);
  }
}

// ---------------- public API ----------------
export async function listStaff(): Promise<StaffUser[]> {
  if (isDemoMode()) return demoStaff().map(strip);
  const db = getAdminSupabase();
  const { data: profiles, error } = await db.from('profiles').select('id, full_name, role, role_id, active, created_at, username').order('created_at');
  if (error) throw new StaffError(error.message, 500);
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const byId = new Map((users?.users || []).map((u) => [u.id, u]));
  return (profiles || []).map((p: any) => ({
    id: p.id,
    email: byId.get(p.id)?.email || '',
    full_name: p.full_name,
    role: p.role,
    role_id: p.role_id ?? null,
    active: p.active !== false,
    created_at: p.created_at,
    last_sign_in_at: byId.get(p.id)?.last_sign_in_at ?? null,
    username: p.username ?? null,
  }));
}

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
export function cleanUsername(u: string) {
  return u.trim().toLowerCase();
}
/** A free username: the one asked for (must be free) or the email's first part (+ a number). */
async function pickUsername(wanted: string | null | undefined, email: string, exceptId?: string): Promise<string> {
  const db = getAdminSupabase();
  const taken = async (u: string) => {
    const { data } = await db.from('profiles').select('id').ilike('username', u).maybeSingle();
    return !!data && data.id !== exceptId;
  };
  if (wanted) {
    const u = cleanUsername(wanted);
    if (!USERNAME_RE.test(u)) throw new StaffError('Username: 3-30 characters, only letters, numbers, dot, dash or underscore');
    if (await taken(u)) throw new StaffError('This username is already taken', 409);
    return u;
  }
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 26) || 'user';
  for (let n = 1; ; n++) {
    const u = n === 1 ? base : `${base}${n}`;
    if (!(await taken(u))) return u;
  }
}

export async function createStaff(input: { email: string; full_name: string; password: string; role: Role; role_id?: string | null; username?: string | null }): Promise<StaffUser> {
  const role_id = input.role === 'owner' ? null : input.role_id ?? null;
  const email = input.email.trim().toLowerCase();
  if (!validEmail(email)) throw new StaffError('Enter a valid email');
  if (!input.full_name.trim()) throw new StaffError('Enter a name');
  checkPassword(input.password);

  if (isDemoMode()) {
    if (demoStaff().some((u) => u.email === email)) throw new StaffError('This email already has an account', 409);
    const u: DemoStaff = { id: randomUUID(), email, full_name: input.full_name.trim(), role: input.role, role_id, active: true, created_at: new Date().toISOString(), last_sign_in_at: null, hash: hashPassword(input.password) };
    demoStaff().push(u);
    return strip(u);
  }

  const db = getAdminSupabase();
  const username = await pickUsername(input.username, email);
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name.trim() },
  });
  if (error || !data.user) throw new StaffError(error?.message || 'Could not create user', 400);
  // The DB trigger creates the profile; set the chosen role and name explicitly.
  const { error: pErr } = await db
    .from('profiles')
    .upsert({ id: data.user.id, full_name: input.full_name.trim(), role: input.role, role_id, active: true, username }, { onConflict: 'id' });
  if (pErr) throw new StaffError(pErr.message, 500);
  return { id: data.user.id, email, full_name: input.full_name.trim(), role: input.role, role_id, active: true, created_at: data.user.created_at, username };
}

export async function updateStaff(
  actorId: string | null,
  id: string,
  changes: { full_name?: string; role?: Role; role_id?: string | null; active?: boolean; password?: string; username?: string }
): Promise<StaffUser> {
  const list = await listStaff();
  const target = list.find((u) => u.id === id);
  if (!target) throw new StaffError('User not found', 404);
  if ((changes.role && changes.role !== 'owner') || changes.active === false) await assertNotLastAdmin(id, list);
  if (actorId === id && changes.active === false) throw new StaffError('You cannot deactivate your own account', 409);
  if (changes.password !== undefined) checkPassword(changes.password);

  if (isDemoMode()) {
    const u = demoStaff().find((x) => x.id === id)!;
    if (changes.full_name?.trim()) u.full_name = changes.full_name.trim();
    if (changes.role) u.role = changes.role;
    if (changes.role_id !== undefined) u.role_id = changes.role_id;
    if (u.role === 'owner') u.role_id = null;
    if (typeof changes.active === 'boolean') u.active = changes.active;
    if (changes.password) u.hash = hashPassword(changes.password);
    return strip(u);
  }

  const db = getAdminSupabase();
  const patch: Record<string, unknown> = {};
  if (changes.full_name?.trim()) patch.full_name = changes.full_name.trim();
  if (changes.role) patch.role = changes.role;
  if (changes.role_id !== undefined) patch.role_id = changes.role_id;
  if (changes.role === 'owner') patch.role_id = null;
  if (typeof changes.active === 'boolean') patch.active = changes.active;
  if (changes.username !== undefined) patch.username = await pickUsername(changes.username, target.email, id);
  if (Object.keys(patch).length) {
    const { error } = await db.from('profiles').update(patch).eq('id', id);
    if (error) throw new StaffError(error.message, 500);
  }
  const authPatch: Record<string, unknown> = {};
  if (changes.password) authPatch.password = changes.password;
  // A deactivated user is also banned in Supabase Auth, so existing sessions stop refreshing.
  if (typeof changes.active === 'boolean') authPatch.ban_duration = changes.active ? 'none' : '876000h';
  if (Object.keys(authPatch).length) {
    const { error } = await db.auth.admin.updateUserById(id, authPatch as any);
    if (error) throw new StaffError(error.message, 500);
  }
  return { ...target, ...patch } as StaffUser;
}

export async function deleteStaff(actorId: string | null, id: string): Promise<void> {
  const list = await listStaff();
  if (!list.some((u) => u.id === id)) throw new StaffError('User not found', 404);
  if (actorId === id) throw new StaffError('You cannot delete your own account', 409);
  await assertNotLastAdmin(id, list);
  if (isDemoMode()) {
    g.__pbDemoStaff = demoStaff().filter((u) => u.id !== id);
    return;
  }
  const { error } = await getAdminSupabase().auth.admin.deleteUser(id); // profile row cascades
  if (error) throw new StaffError(error.message, 500);
}
