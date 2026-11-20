// Two-factor authentication (TOTP: Microsoft Authenticator, Google Authenticator, ...) on top of
// Supabase Auth MFA. A user with a verified factor must enter a 6-digit code after the password;
// until then the session is "aal1" and getViewer / the middleware treat it as signed out.
import { createServerSupabase } from '@/lib/supabase/server';

export async function mfaState() {
  const supabase = await createServerSupabase();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = (factors?.totp || []).filter((f) => f.status === 'verified');
  return {
    supabase,
    enabled: totp.length > 0,
    factorId: totp[0]?.id ?? null,
    needsCode: aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2',
    all: factors?.all || [],
  };
}

export const sixDigits = (v: unknown) => /^\d{6}$/.test(String(v ?? '').replace(/\s/g, ''));
export const clean = (v: unknown) => String(v ?? '').replace(/\s/g, '');
