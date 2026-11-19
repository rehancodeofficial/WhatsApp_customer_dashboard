import { describe, it, expect, beforeEach } from 'vitest';
import { ALL_PERMISSIONS, MANAGEMENT_DEFAULT, can, sanitizePermissions } from '@/lib/permissions';
import { createRole, deleteRole, listRoles, resetDemoRoles, updateRole } from '@/lib/roles';
import { createDemoSession, readDemoSession } from '@/lib/demo-session';
import {
  resetDemoStaff,
  demoAuthenticate,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  DEMO_ACCOUNTS,
} from '@/lib/staff';

process.env.NEXT_PUBLIC_DEMO_MODE = 'true';

describe('role-based permissions', () => {
  const admin = { role: 'owner' as const };
  const mgmt = { role: 'agent' as const, permissions: MANAGEMENT_DEFAULT };

  it('Admin (owner) can do everything, with or without a permission list', () => {
    for (const p of ALL_PERMISSIONS) expect(can(admin, p)).toBe(true);
  });
  it('a staff user gets exactly the ticked permissions, nothing else', () => {
    expect(can(mgmt, 'chats.view')).toBe(true);
    expect(can(mgmt, 'supplier_chats.view')).toBe(true);
    expect(can(mgmt, 'chats.reply')).toBe(false); // chats are view-only for staff
    expect(can(mgmt, 'ai.toggle')).toBe(false);
    expect(can(mgmt, 'payments.manage')).toBe(false);
    expect(can(mgmt, 'stats.view')).toBe(false);
    expect(can(mgmt, 'inventory.view')).toBe(false);
    expect(can(mgmt, 'broadcast.send')).toBe(false);
  });
  it('admin-only permissions can never be granted to a role', () => {
    const sneaky = { role: 'agent' as const, permissions: ['staff.manage', 'settings.view', 'chats.view'] };
    expect(can(sneaky, 'staff.manage')).toBe(false);
    expect(can(sneaky, 'settings.view')).toBe(false);
    expect(can(sneaky, 'chats.view')).toBe(true);
    expect(sanitizePermissions(['staff.manage', 'bogus', 'orders.view', 'orders.view'])).toEqual(['orders.view']);
  });
  it('no role = no access; nobody signed in can do nothing', () => {
    expect(can({ role: 'agent', permissions: [] }, 'chats.view')).toBe(false);
    expect(can({ role: 'agent' }, 'chats.view')).toBe(false);
    expect(can(null, 'chats.view')).toBe(false);
  });
});

describe('custom roles (demo store)', () => {
  beforeEach(() => resetDemoRoles());
  it('admin creates a role with ticked permissions; admin-only ones are stripped', async () => {
    const r = await createRole({ name: 'Inventory Viewer', permissions: ['inventory.view', 'staff.manage'] });
    expect(r.permissions).toEqual(['inventory.view']);
    await expect(createRole({ name: 'inventory viewer', permissions: [] })).rejects.toThrow(/exists/);
    await expect(createRole({ name: 'Admin', permissions: [] })).rejects.toThrow(/reserved/);
    const u = await updateRole(r.id, { permissions: ['orders.view', 'orders.manage'] });
    expect(u.permissions).toEqual(['orders.view', 'orders.manage']);
    await deleteRole(r.id);
    expect((await listRoles()).some((x) => x.id === r.id)).toBe(false);
  });
});

describe('demo login + staff accounts', () => {
  beforeEach(() => resetDemoStaff());

  it('logs in with the demo accounts and rejects a wrong password', () => {
    expect(demoAuthenticate(DEMO_ACCOUNTS[0].email, DEMO_ACCOUNTS[0].password)?.role).toBe('owner');
    expect(demoAuthenticate(DEMO_ACCOUNTS[1].email, DEMO_ACCOUNTS[1].password)?.role).toBe('agent');
    expect(demoAuthenticate(DEMO_ACCOUNTS[0].email, 'wrong-password')).toBeNull();
  });

  it('session cookie is signed and tamper-proof', () => {
    const s = createDemoSession('user-1');
    expect(readDemoSession(s.value)).toBe('user-1');
    const [payload, sig] = s.value.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'admin', exp: 9999999999 })).toString('base64url');
    expect(readDemoSession(`${forged}.${sig}`)).toBeNull();
    expect(readDemoSession(`${payload}.x${sig.slice(1)}`)).toBeNull();
  });

  it('admin can add a Management user who can then log in', async () => {
    await createStaff({ email: 'ali@phonebuzz.ae', full_name: 'Ali', password: 'secret123', role: 'agent' });
    expect(demoAuthenticate('ali@phonebuzz.ae', 'secret123')?.role).toBe('agent');
    await expect(createStaff({ email: 'ali@phonebuzz.ae', full_name: 'Ali 2', password: 'secret123', role: 'agent' })).rejects.toThrow(/already/);
    await expect(createStaff({ email: 'x@y.com', full_name: 'X', password: 'short', role: 'agent' })).rejects.toThrow(/8 characters/);
  });

  it('a deactivated user can no longer log in', async () => {
    const admin = (await listStaff()).find((u) => u.role === 'owner')!;
    const mgmt = (await listStaff()).find((u) => u.role === 'agent')!;
    await updateStaff(admin.id, mgmt.id, { active: false });
    expect(demoAuthenticate(DEMO_ACCOUNTS[1].email, DEMO_ACCOUNTS[1].password)).toBeNull();
  });

  it('the last Admin cannot be demoted, deactivated or deleted, and nobody can delete themselves', async () => {
    const admin = (await listStaff()).find((u) => u.role === 'owner')!;
    const mgmt = (await listStaff()).find((u) => u.role === 'agent')!;
    await expect(updateStaff(mgmt.id, admin.id, { role: 'agent' })).rejects.toThrow(/only active Admin/);
    await expect(updateStaff(mgmt.id, admin.id, { active: false })).rejects.toThrow(/only active Admin/);
    await expect(deleteStaff(mgmt.id, admin.id)).rejects.toThrow(/only active Admin/);
    await expect(deleteStaff(admin.id, admin.id)).rejects.toThrow(/your own/);
  });

  it('password reset works', async () => {
    const admin = (await listStaff()).find((u) => u.role === 'owner')!;
    const mgmt = (await listStaff()).find((u) => u.role === 'agent')!;
    await updateStaff(admin.id, mgmt.id, { password: 'NewPass123' });
    expect(demoAuthenticate(DEMO_ACCOUNTS[1].email, 'NewPass123')).not.toBeNull();
    expect(demoAuthenticate(DEMO_ACCOUNTS[1].email, DEMO_ACCOUNTS[1].password)).toBeNull();
  });
});
