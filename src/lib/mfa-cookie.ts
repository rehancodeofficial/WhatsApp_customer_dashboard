// Proof that the Admin finished sign-in with a code sent to the recovery email (instead of the
// authenticator app). An HMAC-signed, httpOnly cookie bound to the user; checked by the middleware
// (edge) and getViewer (node), so it uses Web Crypto only.
export const EMAIL_MFA_COOKIE = 'pb_mfa_email';
export const EMAIL_MFA_HOURS = 12;

async function hmac(data: string) {
  const secret = process.env.PASSWORD_VAULT_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('pb-mfa-email:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makeEmailMfaCookie(userId: string) {
  const exp = Date.now() + EMAIL_MFA_HOURS * 3600_000;
  return `${userId}.${exp}.${await hmac(`${userId}.${exp}`)}`;
}

export async function emailMfaOk(value: string | undefined | null, userId: string) {
  if (!value) return false;
  const [uid, exp, sig] = value.split('.');
  if (uid !== userId || !exp || !sig || Number(exp) < Date.now()) return false;
  const want = await hmac(`${uid}.${exp}`);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
