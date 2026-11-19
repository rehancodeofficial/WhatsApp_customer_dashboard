// Role-based access.
//  - Admin ("owner" in the database) is the business owner: every permission, always.
//  - Every other user ("agent" in the database) gets exactly the permissions ticked on their
//    custom role (staff_roles.permissions). Nothing else. No role = no access.
// Admin-only permissions can never be granted to a custom role.

export type Role = 'owner' | 'agent';

export const ROLE_LABEL: Record<Role, string> = { owner: 'Admin', agent: 'Staff' };

export const PERMISSION_GROUPS = [
  {
    group: 'Dashboard',
    items: [{ key: 'stats.view', label: 'Sales analytics', hint: 'Revenue, orders and top products charts' }],
  },
  {
    group: 'Chats (view only)',
    items: [
      { key: 'chats.view', label: 'Customer chats', hint: 'Read customer ↔ AI WhatsApp chats' },
      { key: 'supplier_chats.view', label: 'Supplier chats', hint: 'Read supplier ↔ AI WhatsApp chats' },
      { key: 'chats.organize', label: 'Organize chats', hint: 'Star and archive chats' },
    ],
  },
  {
    group: 'Notifications',
    items: [{ key: 'notifications.view', label: 'Owner notifications', hint: 'Alerts the AI sends to the owner on WhatsApp' }],
  },
  {
    group: 'Customers',
    items: [
      { key: 'customers.view', label: 'View customers', hint: 'Customer records and history' },
      { key: 'customers.manage', label: 'Edit customers', hint: 'Add / edit tier, brands, notes' },
    ],
  },
  {
    group: 'Inventory',
    items: [
      { key: 'inventory.view', label: 'View inventory', hint: 'Stock records, movement log, analytics' },
      { key: 'inventory.manage', label: 'Manage inventory', hint: 'Add products, stock in/out' },
    ],
  },
  {
    group: 'Orders',
    items: [
      { key: 'orders.view', label: 'View orders', hint: 'Order records' },
      { key: 'orders.manage', label: 'Manage orders', hint: 'Create orders, change status' },
      { key: 'payments.manage', label: 'Payment status', hint: 'Mark payments pending / verified' },
    ],
  },
  {
    group: 'Suppliers',
    items: [
      { key: 'suppliers.view', label: 'View suppliers', hint: 'Supplier records, price requests and quotes' },
      { key: 'suppliers.manage', label: 'Manage suppliers', hint: 'Add / edit suppliers' },
    ],
  },
  {
    group: 'Marketing',
    items: [{ key: 'broadcast.send', label: 'Broadcasts', hint: 'Send product offers to customers, AI suggestions' }],
  },
] as const;

export type GrantablePermission = (typeof PERMISSION_GROUPS)[number]['items'][number]['key'];
// chats.reply / ai.toggle: the dashboard is view-only for chats; these stay admin-only on the server.
export type AdminOnlyPermission = 'staff.manage' | 'settings.view' | 'chats.reply' | 'ai.toggle';
export type Permission = GrantablePermission | AdminOnlyPermission;

export const GRANTABLE_PERMISSIONS: GrantablePermission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
export const ADMIN_ONLY_PERMISSIONS: AdminOnlyPermission[] = ['staff.manage', 'settings.view', 'chats.reply', 'ai.toggle'];
export const ALL_PERMISSIONS: Permission[] = [...GRANTABLE_PERMISSIONS, ...ADMIN_ONLY_PERMISSIONS];

/** The permissions the old fixed "Management" role had. Used as the default role. */
export const MANAGEMENT_DEFAULT: GrantablePermission[] = ['chats.view', 'supplier_chats.view', 'chats.organize', 'customers.view', 'notifications.view'];

export interface Access {
  role: Role;
  permissions?: readonly string[] | null;
}

/** Keep only real, grantable permissions (drops unknown keys and admin-only ones). */
export function sanitizePermissions(list: readonly string[] | null | undefined): GrantablePermission[] {
  const allowed = new Set<string>(GRANTABLE_PERMISSIONS);
  return Array.from(new Set((list || []).filter((p) => allowed.has(p)))) as GrantablePermission[];
}

export function can(access: Access | null | undefined, p: Permission): boolean {
  if (!access) return false;
  if (access.role === 'owner') return true;
  if ((ADMIN_ONLY_PERMISSIONS as string[]).includes(p)) return false;
  return sanitizePermissions(access.permissions).includes(p as GrantablePermission);
}

export function permissionsOf(access: Access | null | undefined): Permission[] {
  return ALL_PERMISSIONS.filter((p) => can(access, p));
}

export function roleLabel(role: Role | null | undefined, roleName?: string | null) {
  if (!role) return '';
  return role === 'owner' ? 'Admin' : roleName || 'Staff';
}
