import { createClient } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { demoAuthenticate, demoOwnerEmail } from '@/lib/staff';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Confirms the OWNER's password for sensitive chat actions (verify payment, pausing the AI by hand).
 * Checked with a separate client that keeps no session, so the signed-in user stays as they are.
 * Returns an error message, or null when the password is right.
 */
export async function checkOwnerPassword(viewerId: string, password: string | undefined | null): Promise<string | null> {
  if (!password) return "Enter the owner's password";
  if (!rateLimit(`ownerpw:${viewerId}`, 6, 10 * 60_000)) return 'Too many attempts. Wait 10 minutes.';
  if (isDemoMode()) {
    const email = demoOwnerEmail();
    return email && demoAuthenticate(email, password) ? null : "Owner's password is wrong";
  }
  const admin = getAdminSupabase();
  const { data: owner } = await admin.from('profiles').select('id').eq('role', 'owner').eq('active', true).limit(1).maybeSingle();
  if (!owner) return 'Owner account not found';
  const { data: u } = await admin.auth.admin.getUserById(owner.id);
  const email = u?.user?.email;
  if (!email) return 'Owner account has no email';
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await check.auth.signInWithPassword({ email, password });
  if (error) return "Owner's password is wrong";
  return null;
}
