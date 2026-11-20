// Staff security helpers: encrypted password copies (Admin can view with 2FA), account lock after
// 3 wrong passwords, activity log and owner notifications. Server only.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const MAX_FAILED_LOGINS = 3;

// The key never leaves the server. PASSWORD_VAULT_KEY can be set; otherwise it is derived from the
// service role key (also server-only). Changing either makes stored copies unreadable (they then
// show as "not stored" until the next password change).
function key() {
  const base = process.env.PASSWORD_VAULT_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base) throw new Error('No vault key configured');
  return createHash('sha256').update('phonebuzz-password-vault:' + base).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}

export function decryptSecret(blob: string) {
  const [v, iv, tag, data] = blob.split('.');
  if (v !== 'v1') throw new Error('Unknown format');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

const db = () => getAdminSupabase();

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  const { data } = await db().auth.admin.listUsers({ perPage: 1000 });
  return data?.users.find((u) => (u.email || '').toLowerCase() === e)?.id ?? null;
}

export async function getProfile(userId: string) {
  const { data } = await db().from('profiles').select('id, full_name, role, active, failed_logins, locked_at').eq('id', userId).maybeSingle();
  return data as { id: string; full_name: string; role: string; active: boolean; failed_logins: number; locked_at: string | null } | null;
}

/** Wrong password / code: counts up and blocks the account at 3. Returns true when it is now blocked. */
export async function recordFailedLogin(userId: string, email: string, ip: string, what = 'password'): Promise<boolean> {
  const p = await getProfile(userId);
  if (!p) return false;
  const n = (p.failed_logins || 0) + 1;
  const lock = n >= MAX_FAILED_LOGINS && !p.locked_at;
  await db().from('profiles').update({ failed_logins: n, ...(lock ? { locked_at: new Date().toISOString() } : {}) }).eq('id', userId);
  await logActivity({ id: userId, name: p.full_name, email, role: p.role }, lock ? 'account.blocked' : 'login.failed', { attempt: n, reason: `wrong ${what}` }, ip);
  if (lock) {
    await notifyOwner(
      `Account blocked: ${p.full_name || email}`,
      `${p.full_name || email} (${email}) entered a wrong ${what} ${MAX_FAILED_LOGINS} times. The account is blocked until an Admin unblocks it or sets a new password in Team & Access → Security.`
    );
  }
  return lock || !!p.locked_at;
}

export async function recordSuccessfulLogin(userId: string) {
  await db().from('profiles').update({ failed_logins: 0, last_login_at: new Date().toISOString() }).eq('id', userId);
}

/** Saves the new password (encrypted) and the change time; tells the owner when staff changed it. */
export async function recordPasswordChange(target: { id: string; name: string; email: string; role: string }, password: string, by: { id: string; name: string; role: string } | null, how: string) {
  if (isDemoMode()) return;
  const now = new Date().toISOString();
  await db().from('staff_secrets').upsert({ user_id: target.id, enc: encryptSecret(password), updated_at: now, updated_by: by?.id ?? null }, { onConflict: 'user_id' });
  await db().from('profiles').update({ password_changed_at: now }).eq('id', target.id);
  if (target.role !== 'owner' || (by && by.id !== target.id)) {
    await notifyOwner(
      `Password changed: ${target.name || target.email}`,
      `${target.name || target.email} (${target.email}) ${how}. The new password is in Team & Access → Security (open it with your authenticator code).`
    );
  }
}

export async function notifyOwner(title: string, body: string) {
  if (isDemoMode()) return;
  await db()
    .from('notifications')
    .insert({ type: 'security', title, body, wa_id: null, party: null, order_no: null, request_code: null, read_at: null })
    .then(({ error }) => error && console.error('owner notification failed', error.message));
}

export interface Actor {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  roleName?: string | null;
}

/** One line in the activity log. Never throws. */
export async function logActivity(actor: Actor | null, action: string, details: Record<string, unknown> = {}, ip?: string | null) {
  if (isDemoMode()) return;
  try {
    await db().from('activity_logs').insert({
      user_id: actor?.id ?? null,
      user_name: actor?.name ?? null,
      user_email: actor?.email ?? null,
      role: actor ? (actor.role === 'owner' ? 'Admin' : actor.roleName || actor.role || 'Staff') : null,
      action,
      details,
      ip: ip ?? null,
    });
  } catch (e) {
    console.error('activity log failed', e);
  }
}

export const ipOf = (req: { headers: Headers }) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
