import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isDemoMode } from '@/lib/config';

let client: SupabaseClient | null = null;

// Browser client using the public anon key + the user's session cookie (so RLS and Realtime apply).
// Returns null in demo mode, where there is no Supabase project.
export function createBrowserSupabase(): SupabaseClient | null {
  if (isDemoMode()) return null;
  if (!client) {
    client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return client;
}
