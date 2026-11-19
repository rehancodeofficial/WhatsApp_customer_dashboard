import { can, type Access } from '@/lib/permissions';
import type { Party } from '@/lib/repo/types';

/** Which chat lists a user may read: customer chats need chats.view, supplier chats supplier_chats.view. */
export function canReadParty(v: Access, party: Party) {
  return can(v, party === 'supplier' ? 'supplier_chats.view' : 'chats.view');
}
export function canReadAnyChat(v: Access) {
  return canReadParty(v, 'customer') || canReadParty(v, 'supplier');
}
