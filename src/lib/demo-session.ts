// Signed session cookie used only in DEMO MODE (live mode uses Supabase Auth cookies).
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const DEMO_COOKIE = 'pb_demo_session';
const MAX_AGE_S = 60 * 60 * 12; // 12 hours

const g = globalThis as unknown as { __pbDemoSecret?: string };
function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (!g.__pbDemoSecret) g.__pbDemoSecret = randomBytes(32).toString('hex');
  return g.__pbDemoSecret;
}

function sign(data: string) {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

export function createDemoSession(userId: string) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S })).toString('base64url');
  return { value: `${payload}.${sign(payload)}`, maxAge: MAX_AGE_S };
}

export function readDemoSession(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const [payload, sig] = cookie.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof uid !== 'string' || exp < Date.now() / 1000) return null;
    return uid;
  } catch {
    return null;
  }
}
