// Owner (Admin) password reset by email.
// The owner types the login email or the recovery email; a one-time link valid for 15 minutes is
// sent to the recovery email (Outlook) through the n8n bridge. Only a SHA-256 of the token is stored.
import { createHash, randomBytes } from 'crypto';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { callN8nBridge } from '@/lib/n8n-bridge';

export const RESET_MINUTES = 15;

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export function maskEmail(e: string) {
  const [u, d] = e.split('@');
  if (!d) return e;
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

/** Owner account whose login email or recovery email matches, or null. */
export async function findOwnerByEmail(email: string) {
  const db = getAdminSupabase();
  const e = email.trim().toLowerCase();
  const { data: owners } = await db.from('profiles').select('id, full_name, role, active, recovery_email').eq('role', 'owner');
  for (const p of owners || []) {
    if (p.active === false) continue;
    const { data } = await db.auth.admin.getUserById(p.id);
    const login = (data.user?.email || '').toLowerCase();
    const recovery = String(p.recovery_email || '').toLowerCase();
    if (e === login || (recovery && e === recovery)) {
      return { id: p.id as string, name: (p.full_name as string) || 'Admin', loginEmail: login, sendTo: recovery || login };
    }
  }
  return null;
}

export async function sendOwnerResetLink(owner: { id: string; name: string; loginEmail: string; sendTo: string }, origin: string) {
  const db = getAdminSupabase();
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + RESET_MINUTES * 60_000);
  // Older links stop working as soon as a new one is requested.
  await db.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('user_id', owner.id).is('used_at', null);
  const { error } = await db.from('password_reset_tokens').insert({ user_id: owner.id, token_hash: hash(token), sent_to: owner.sendTo, expires_at: expires.toISOString() });
  if (error) throw new Error('Could not create the reset link: ' + error.message);

  const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1E293B">
  <h2 style="color:#F97316;margin:0 0 12px">Phone Buzz Dashboard</h2>
  <p>Hello ${escapeHtml(owner.name)},</p>
  <p>Someone asked to reset the password of the dashboard account <b>${escapeHtml(owner.loginEmail)}</b>.</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#F97316;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Reset password</a></p>
  <p>This link works once and expires in <b>${RESET_MINUTES} minutes</b> (${expires.toUTCString()}).</p>
  <p style="color:#64748B;font-size:13px">If you did not ask for this, ignore this email. Your password stays the same.</p>
</div>`;
  const res = await callN8nBridge('send_email', { to: owner.sendTo, subject: 'Reset your Phone Buzz Dashboard password', html });
  if (res && res.ok === false) throw new Error('The email could not be sent: ' + (res.error || 'unknown error'));
  return { sentTo: owner.sendTo, expiresAt: expires.toISOString() };
}

/** Checks the link and sets the new password. The link can be used only once. */
export async function completeOwnerReset(token: string, password: string) {
  const db = getAdminSupabase();
  const { data: row } = await db.from('password_reset_tokens').select('id, user_id, expires_at, used_at').eq('token_hash', hash(token)).maybeSingle();
  if (!row || row.used_at) throw Object.assign(new Error('This reset link is not valid any more. Ask for a new one.'), { status: 400 });
  if (new Date(row.expires_at).getTime() < Date.now()) throw Object.assign(new Error(`This reset link has expired (links last ${RESET_MINUTES} minutes). Ask for a new one.`), { status: 400 });
  // Mark used first so the same link cannot be raced twice.
  const { data: claimed } = await db.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', row.id).is('used_at', null).select('id');
  if (!claimed?.length) throw Object.assign(new Error('This reset link was already used.'), { status: 400 });
  const { error } = await db.auth.admin.updateUserById(row.user_id, { password });
  if (error) throw Object.assign(new Error('Could not set the new password: ' + error.message), { status: 400 });
  return { ok: true };
}

export async function checkResetToken(token: string) {
  const { data: row } = await getAdminSupabase().from('password_reset_tokens').select('expires_at, used_at').eq('token_hash', hash(token)).maybeSingle();
  if (!row || row.used_at) return { valid: false, reason: 'used' as const };
  if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false, reason: 'expired' as const };
  return { valid: true, expiresAt: row.expires_at as string };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
