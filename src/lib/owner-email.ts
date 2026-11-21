import { getAdminSupabase } from './supabase/admin';
import { isDemoMode } from './config';
import { demoOwnerEmail } from './staff';

let cachedOwnerEmail: string | null = null;
let lastOwnerCheck = 0;

export async function getBusinessOwnerEmail(): Promise<string> {
  if (isDemoMode()) {
    return demoOwnerEmail() || 'owner@phonebuzz.me';
  }
  const now = Date.now();
  if (cachedOwnerEmail && now - lastOwnerCheck < 5 * 60_000) {
    return cachedOwnerEmail;
  }
  const admin = getAdminSupabase();
  const { data: owner } = await admin.from('profiles').select('id').eq('role', 'owner').eq('active', true).limit(1).maybeSingle();
  if (owner) {
    const { data: u } = await admin.auth.admin.getUserById(owner.id);
    if (u?.user?.email) {
      cachedOwnerEmail = u.user.email;
      lastOwnerCheck = now;
      return cachedOwnerEmail;
    }
  }
  return cachedOwnerEmail || 'qasim@phonebuzz.me';
}
