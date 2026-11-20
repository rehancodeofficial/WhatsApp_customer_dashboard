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

/**
 * Step-up check for sensitive changes (password, profile): when two-factor sign-in is on,
 * the request must carry a current 6-digit code from the authenticator app.
 * Returns an error message, or null when the change may go ahead.
 */
export async function requireCodeIfEnabled(code: unknown): Promise<string | null> {
  const s = await mfaState();
  if (!s.enabled || !s.factorId) return null;
  if (!sixDigits(code)) return 'Enter the 6-digit code from Microsoft Authenticator to save this change.';
  const { error } = await s.supabase.auth.mfa.challengeAndVerify({ factorId: s.factorId, code: clean(code) });
  return error ? 'Wrong or expired authenticator code. Try the current code in the app.' : null;
}

/** Admin actions on other people's accounts (view password, set password, unblock) always need 2FA. */
export async function requireOwnCode(code: unknown): Promise<string | null> {
  const s = await mfaState();
  if (!s.enabled || !s.factorId) return 'Turn on two-factor sign-in first (Settings → Security). It is needed to view or change staff passwords.';
  if (!sixDigits(code)) return 'Enter the 6-digit code from Microsoft Authenticator.';
  const { error } = await s.supabase.auth.mfa.challengeAndVerify({ factorId: s.factorId, code: clean(code) });
  return error ? 'Wrong or expired authenticator code.' : null;
}
