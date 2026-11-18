import { createClient } from '@supabase/supabase-js';

// Service role client: bypasses RLS for backend API endpoints, n8n ingestion, and system webhooks
export function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mockproject.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock_service_role';

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
