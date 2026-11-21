import { createClient } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { demoAuthenticate, demoOwnerEmail } from '@/lib/staff';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Confirms the user's or owner's password for sensitive chat actions (verify payment, pausing the AI by hand, supplier delivery).
 * Checks the signed-in user's password first, or owner's password.
 * Returns an error message, or null when the password is right.
 */
export async function checkOwnerPassword(viewerId: string, password: string | undefined | null): Promise<string | null> {
  if (!password) return "Enter your password";
  if (!rateLimit(`ownerpw:${viewerId}`, 10, 10 * 60_000)) return 'Too many attempts. Wait 10 minutes.';
  if (isDemoMode()) {
    const email = demoOwnerEmail();
    return email && demoAuthenticate(email, password) ? null : "Password is wrong";
  }
  const admin = getAdminSupabase();

  // 1. Try checking the signed-in user's own password
  const { data: viewerUser } = await admin.auth.admin.getUserById(viewerId);
  const viewerEmail = viewerUser?.user?.email;
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

  if (viewerEmail) {
    const { error: viewerErr } = await check.auth.signInWithPassword({ email: viewerEmail, password });
    if (!viewerErr) return null; // Viewer's password matches!
  }

  // 2. Also allow the owner's password as fallback
  const { data: owner } = await admin.from('profiles').select('id').eq('role', 'owner').eq('active', true).limit(1).maybeSingle();
  if (owner && owner.id !== viewerId) {
    const { data: u } = await admin.auth.admin.getUserById(owner.id);
    const ownerEmail = u?.user?.email;
    if (ownerEmail) {
      const { error: ownerErr } = await check.auth.signInWithPassword({ email: ownerEmail, password });
      if (!ownerErr) return null; // Owner's password matches!
    }
  }

  return "Password is wrong";
}
