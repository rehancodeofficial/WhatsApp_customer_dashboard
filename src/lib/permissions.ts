// Two staff roles.
//  - Admin ("owner" in the database): full access.
//  - Management ("agent" in the database): works the inbox only.
// The database keeps the original enum values; the UI shows the friendly names.

export type Role = 'owner' | 'agent';

export const ROLE_LABEL: Record<Role, string> = { owner: 'Admin', agent: 'Management' };

export type Permission =
  | 'chats.view' // see all customer chats
  | 'chats.reply' // send WhatsApp messages
  | 'ai.toggle' // pause / resume / run AI per customer
  | 'chats.organize' // star, archive, close, assign
  | 'customers.view'
  | 'payments.manage' // mark payment pending / verified
  | 'stats.view' // overview + analytics
  | 'staff.manage' // add / edit / remove staff accounts
  | 'settings.view';

const MANAGEMENT: Permission[] = ['chats.view', 'chats.reply', 'ai.toggle', 'chats.organize', 'customers.view'];

export function can(role: Role | null | undefined, p: Permission): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  return MANAGEMENT.includes(p);
}

export function roleLabel(role: Role | null | undefined) {
  return role ? ROLE_LABEL[role] : '';
}
