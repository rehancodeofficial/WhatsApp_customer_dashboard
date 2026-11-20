// 6-digit codes sent by email (Admin sign-in when the authenticator is not at hand). Only a hash is stored.
import { createHash, randomInt } from 'crypto';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { callN8nBridge } from '@/lib/n8n-bridge';

export const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const hash = (c: string) => createHash('sha256').update('pb-email-code:' + c).digest('hex');

export async function sendEmailCode(userId: string, to: string, purpose: 'login', name: string) {
  const db = getAdminSupabase();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.from('email_codes').update({ used_at: new Date().toISOString() }).eq('user_id', userId).eq('purpose', purpose).is('used_at', null);
  const { error } = await db.from('email_codes').insert({ user_id: userId, purpose, code_hash: hash(code), sent_to: to, expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString() });
  if (error) throw new Error('Could not create the code: ' + error.message);
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1E293B">
  <h2 style="color:#F97316;margin:0 0 12px">Phone Buzz Dashboard</h2>
  <p>Hello ${name.replace(/[<>&"]/g, '')},</p>
  <p>Your sign-in verification code is:</p>
  <p style="font-size:30px;font-weight:bold;letter-spacing:8px;margin:18px 0;font-family:monospace">${code}</p>
  <p>It works once and expires in <b>${CODE_MINUTES} minutes</b>.</p>
  <p style="color:#64748B;font-size:13px">If you did not try to sign in, someone may know your password: change it in Settings.</p>
</div>`;
  const res = await callN8nBridge('send_email', { to, subject: `Your Phone Buzz Dashboard code: ${code}`, html });
  if (res && res.ok === false) throw new Error('The email could not be sent: ' + (res.error || 'unknown error'));
}

/** 'ok' | 'wrong' | 'expired' | 'none' | 'too_many' */
export async function checkEmailCode(userId: string, purpose: 'login', code: string) {
  const db = getAdminSupabase();
  const { data: row } = await db
    .from('email_codes')
    .select('id, code_hash, attempts, expires_at, used_at')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return 'none' as const;
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired' as const;
  if (row.attempts >= MAX_ATTEMPTS) return 'too_many' as const;
  if (row.code_hash !== hash(code)) {
    await db.from('email_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return 'wrong' as const;
  }
  await db.from('email_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
  return 'ok' as const;
}
