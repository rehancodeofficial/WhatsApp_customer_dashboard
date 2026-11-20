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

// ---------------- Trusted device ("Don't ask again on this device for 3 days") ----------------
// After a correct authenticator / email code the browser gets a signed cookie for 3 days. Bound to the
// user and to the time their password last changed (`epoch`): a new password ends every trusted device.
export const TRUST_COOKIE = 'pb_trusted_device';
export const TRUST_DAYS = 3;

export async function makeTrustCookie(userId: string, epoch: number) {
  const exp = Date.now() + TRUST_DAYS * 86_400_000;
  const dev = crypto.randomUUID().slice(0, 8);
  const body = `${userId}.${exp}.${epoch}.${dev}`;
  return `${body}.${await hmac('trust:' + body)}`;
}

/** Valid for this user and not expired. Pass `epoch` to also require the current password (server side). */
export async function trustOk(value: string | undefined | null, userId: string, epoch?: number) {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 5) return false;
  const [uid, exp, ep, dev, sig] = parts;
  if (uid !== userId || Number(exp) < Date.now()) return false;
  if (epoch !== undefined && Number(ep) !== epoch) return false;
  const want = await hmac(`trust:${uid}.${exp}.${ep}.${dev}`);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export const passwordEpoch = (changedAt: string | null | undefined) => (changedAt ? Date.parse(changedAt) || 0 : 0);
