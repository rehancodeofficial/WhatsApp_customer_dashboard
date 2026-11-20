'use client';
// Team & Access → Security (every account: status, 2FA, password, last change, last login) and
// Activity log (what every user did). Admin only. Viewing, setting or unblocking needs the Admin's
// own Microsoft Authenticator code each time.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, LockOpen, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { api, Button, Card, Chip, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, SearchInput, Table, td } from '../ui';

export interface SecUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'agent';
  roleLabel: string;
  status: 'active' | 'blocked' | 'deactivated';
  lockedAt: string | null;
  failedLogins: number;
  mfa: boolean;
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
  hasPassword: boolean;
}

export function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      maxLength={7}
      className={cx(inputCls, 'font-mono tracking-[0.3em] text-center text-base')}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9 ]/g, ''))}
      placeholder="123 456"
    />
  );
}
export const sixDigits = (c: string) => c.replace(/\s/g, '').length === 6;

const STATUS: Record<SecUser['status'], { tone: 'green' | 'red' | 'slate'; label: string }> = {
  active: { tone: 'green', label: 'Active' },
  blocked: { tone: 'red', label: 'Blocked' },
  deactivated: { tone: 'slate', label: 'Deactivated' },
};

export function SecurityTab() {
  const [users, setUsers] = useState<SecUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [action, setAction] = useState<{ kind: 'reveal' | 'unblock' | 'password'; user: SecUser } | null>(null);

  const load = useCallback(() => {
    api<{ users: SecUser[] }>('/api/staff/security').then((d) => setUsers(d.users)).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const blocked = users?.filter((u) => u.status === 'blocked').length || 0;

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <p className="text-xs text-slate-500 max-w-xl">
          Passwords stay hidden. To show, change or unblock, enter your own Microsoft Authenticator code. Accounts are blocked after 3 wrong passwords and stay blocked until you unblock them or set a new password.
        </p>
        {blocked > 0 && <Chip tone="red">{blocked} blocked</Chip>}
      </div>
      <ErrorNote text={err} />
      {ok && <div className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2.5 mb-4">{ok}</div>}
      {!users ? (
        <Loading />
      ) : (
        <Table head={['Name', 'Email', 'Role', 'Status', '2FA', 'Password', 'Password changed', 'Last login', '']} minWidth={1100}>
          {users.map((u) => (
            <tr key={u.id} className={cx('hover:bg-slate-50/60', u.status === 'blocked' && 'bg-rose-50/40')}>
              <td className={cx(td, 'font-medium text-slate-800 whitespace-nowrap')}>{u.name}</td>
              <td className={cx(td, 'text-slate-600')}>{u.email}</td>
              <td className={td}>{u.roleLabel}</td>
              <td className={td}>
                <Chip tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Chip>
                {u.status === 'active' && u.failedLogins > 0 && <div className="text-[10px] text-amber-700 mt-1">{u.failedLogins} wrong try</div>}
              </td>
              <td className={td}>
                {u.mfa ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck className="w-3.5 h-3.5" /> On</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500"><ShieldOff className="w-3.5 h-3.5" /> Off</span>
                )}
              </td>
              <td className={cx(td, 'whitespace-nowrap')}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-slate-700">{shown[u.id] ?? (u.hasPassword ? '••••••••' : '—')}</span>
                  {u.hasPassword &&
                    (shown[u.id] ? (
                      <button className="text-slate-400 hover:text-slate-700" aria-label="Hide password" onClick={() => setShown((s) => { const n = { ...s }; delete n[u.id]; return n; })}>
                        <EyeOff className="w-4 h-4" />
                      </button>
                    ) : (
                      <button className="text-slate-400 hover:text-slate-700" aria-label="Show password" onClick={() => { setErr(null); setOk(null); setAction({ kind: 'reveal', user: u }); }}>
                        <Eye className="w-4 h-4" />
                      </button>
                    ))}
                </div>
                {!u.hasPassword && <div className="text-[10px] text-slate-400">saved after the next change</div>}
              </td>
              <td className={cx(td, 'text-xs text-slate-600 whitespace-nowrap')}>{u.passwordChangedAt ? dateTime(u.passwordChangedAt) : '—'}</td>
              <td className={cx(td, 'text-xs text-slate-600 whitespace-nowrap')}>{u.lastLoginAt ? dateTime(u.lastLoginAt) : '—'}</td>
              <td className={cx(td, 'whitespace-nowrap text-right')}>
                <div className="flex justify-end gap-1.5">
                  {u.status === 'blocked' && (
                    <Button size="sm" variant="brand" onClick={() => { setErr(null); setOk(null); setAction({ kind: 'unblock', user: u }); }}>
                      <LockOpen className="w-3.5 h-3.5" /> Unblock
                    </Button>
                  )}
                  <Button size="sm" variant="light" onClick={() => { setErr(null); setOk(null); setAction({ kind: 'password', user: u }); }}>
                    <KeyRound className="w-3.5 h-3.5" /> Set password
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {action && (
        <CodeActionModal
          action={action}
          onClose={() => setAction(null)}
          onDone={(msg, password) => {
            if (password !== undefined) setShown((s) => ({ ...s, [action.user.id]: password }));
            setAction(null);
            if (msg) setOk(msg);
            load();
          }}
        />
      )}
    </Card>
  );
}

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}

function CodeActionModal({
  action,
  onClose,
  onDone,
}: {
  action: { kind: 'reveal' | 'unblock' | 'password'; user: SecUser };
  onClose: () => void;
  onDone: (msg: string | null, password?: string) => void;
}) {
  const { kind, user } = action;
  const [code, setCode] = useState('');
  const [pw, setPw] = useState(() => (kind === 'password' ? genPassword() : ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (kind === 'reveal') {
        const d = await api<{ password: string }>('/api/staff/security/reveal', { method: 'POST', body: JSON.stringify({ userId: user.id, code }) });
        onDone(null, d.password);
      } else if (kind === 'unblock') {
        await api('/api/staff/security/unblock', { method: 'POST', body: JSON.stringify({ userId: user.id, code }) });
        onDone(`${user.name} is unblocked and can sign in again with the same password.`);
      } else {
        const d = await api<{ whatsapp?: { sent: boolean; to?: string; error?: string } }>(`/api/staff/${user.id}`, { method: 'PATCH', body: JSON.stringify({ password: pw, code }) });
        const w = d.whatsapp;
        onDone(
          `New password saved for ${user.name}${user.status === 'blocked' ? ' and the account is unblocked' : ''}.` +
            (w?.sent ? ` Sent to their WhatsApp (+${w.to}).` : ` Not sent on WhatsApp${w?.error ? `: ${w.error}` : ''}. Share it with them yourself.`),
          pw
        );
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const title = kind === 'reveal' ? `Show password: ${user.name}` : kind === 'unblock' ? `Unblock ${user.name}` : `Set new password: ${user.name}`;
  return (
    <Modal open onClose={onClose} title={title}>
      <ErrorNote text={err} />
      <div className="space-y-4">
        {kind === 'unblock' && (
          <p className="text-sm text-slate-600 flex items-start gap-2">
            <Lock className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" /> Blocked after 3 wrong attempts{user.lockedAt ? ` on ${dateTime(user.lockedAt)}` : ''}. Unblocking keeps the same password. To be safe, you can set a new password instead.
          </p>
        )}
        {kind === 'password' && (
          <Field label="New password" hint="At least 8 characters. It is shown here once more after saving, and stays viewable with your authenticator code.">
            <div className="flex gap-2">
              <input className={cx(inputCls, 'font-mono')} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
              <Button variant="light" size="sm" onClick={() => setPw(genPassword())} aria-label="Generate a password">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </Field>
        )}
        <Field label="Your Microsoft Authenticator code" hint="The 6-digit code for Phone Buzz Dashboard in your app.">
          <CodeInput value={code} onChange={setCode} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="light" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={go} loading={busy} disabled={!sixDigits(code) || (kind === 'password' && pw.length < 8)}>
            {kind === 'reveal' ? 'Show password' : kind === 'unblock' ? 'Unblock' : 'Save password'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Activity log ----------------

interface LogRow {
  id: number;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  role: string | null;
  action: string;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  'login.failed': 'Wrong password / code',
  'login.blocked_attempt': 'Tried to sign in while blocked',
  'account.blocked': 'Account blocked (3 wrong tries)',
  'account.unblocked': 'Unblocked an account',
  'password.changed': 'Changed own password',
  'password.reset_email': 'Reset password by email link',
  'password.reset_authenticator': 'Reset password with authenticator',
  'password.reset_requested': 'Asked the Admin for a new password',
  'login.trusted_device': 'Signed in on a trusted device',
  'login.email_code': 'Signed in with an email code',
  'login.recovery_email_wrong': 'Typed a wrong recovery email',
  'security.device_forgotten': 'Stopped trusting a device',
  'password.viewed': 'Viewed a staff password',
  'profile.updated': 'Updated profile',
  'security.2fa_on': 'Turned on two-factor',
  'security.2fa_off': 'Turned off two-factor',
  'chat.message_sent': 'Sent a WhatsApp message',
  'chat.mode_changed': 'Changed AI / takeover mode',
  'chat.organized': 'Starred / archived a chat',
  'chat.ai_reply_requested': 'Asked the AI to reply now',
  'broadcast.sent': 'Sent a broadcast',
  'order.created': 'Created an order',
  'order.updated': 'Updated an order',
  'customer.created': 'Added a customer',
  'customer.updated': 'Edited a customer',
  'supplier.created': 'Added a supplier',
  'supplier.updated': 'Edited a supplier',
  'supplier.deleted': 'Deleted a supplier',
  'inventory.product_added': 'Added a product',
  'inventory.product_updated': 'Edited a product',
  'inventory.product_deleted': 'Deleted a product',
  'inventory.stock_moved': 'Changed stock',
  'export.downloaded': 'Downloaded an export',
  'staff.created': 'Added a user',
  'staff.updated': 'Changed a user',
  'staff.deleted': 'Deleted a user',
  'staff.reset_request_completed': 'Completed a reset request',
  'role.created': 'Created a role',
  'role.updated': 'Changed a role',
  'role.deleted': 'Deleted a role',
};
const GROUPS = [
  { id: '', label: 'All activity' },
  { id: 'login', label: 'Sign-ins' },
  { id: 'account', label: 'Blocks' },
  { id: 'password', label: 'Passwords' },
  { id: 'chat', label: 'Chats' },
  { id: 'broadcast', label: 'Broadcasts' },
  { id: 'order', label: 'Orders' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'supplier', label: 'Suppliers' },
  { id: 'customer', label: 'Customers' },
  { id: 'staff', label: 'Users' },
  { id: 'role', label: 'Roles' },
];

function detailText(d: Record<string, unknown>) {
  return Object.entries(d || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export function ActivityTab({ users }: { users: { id: string; name: string }[] }) {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [user, setUser] = useState('');
  const [group, setGroup] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLogs(null);
    const sp = new URLSearchParams({ limit: '500' });
    if (user) sp.set('user', user);
    if (group) sp.set('action', group);
    api<{ logs: LogRow[] }>(`/api/activity?${sp}`).then((d) => setLogs(d.logs)).catch((e) => setErr(e.message));
  }, [user, group]);
  useEffect(load, [load]);

  const rows = useMemo(
    () => (logs || []).filter((l) => !q || `${l.user_name} ${l.user_email} ${ACTION_LABEL[l.action] || l.action} ${detailText(l.details)}`.toLowerCase().includes(q.toLowerCase())),
    [logs, q]
  );

  return (
    <Card>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-2 mb-4">
        <select className={cx(inputCls, 'rounded-full')} value={user} onChange={(e) => setUser(e.target.value)} aria-label="User">
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select className={cx(inputCls, 'rounded-full')} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Activity type">
          {GROUPS.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
        <SearchInput value={q} onChange={setQ} placeholder="Search activity" />
        <Button variant="light" onClick={load} aria-label="Refresh"><RefreshCw className="w-4 h-4" /></Button>
      </div>
      <ErrorNote text={err} />
      {!logs ? (
        <Loading />
      ) : !rows.length ? (
        <Empty title="No activity yet" text="Sign-ins, messages, orders, stock changes and password changes appear here." />
      ) : (
        <Table head={['Time', 'User', 'Role', 'Activity', 'Details', 'IP']} minWidth={980}>
          {rows.map((l) => {
            const bad = l.action === 'account.blocked' || l.action === 'login.failed' || l.action === 'login.blocked_attempt';
            return (
              <tr key={l.id} className={cx('hover:bg-slate-50/60', bad && 'bg-rose-50/40')}>
                <td className={cx(td, 'text-xs text-slate-500 whitespace-nowrap tabular-nums')}>{dateTime(l.created_at)}</td>
                <td className={td}>
                  <div className="text-sm text-slate-800">{l.user_name || '—'}</div>
                  <div className="text-[11px] text-slate-400">{l.user_email}</div>
                </td>
                <td className={cx(td, 'text-xs')}>{l.role || '—'}</td>
                <td className={cx(td, 'text-sm whitespace-nowrap', bad ? 'text-rose-700 font-medium' : 'text-slate-700')}>{ACTION_LABEL[l.action] || l.action}</td>
                <td className={cx(td, 'text-xs text-slate-500 max-w-md')}>{detailText(l.details)}</td>
                <td className={cx(td, 'text-[11px] text-slate-400 font-mono')}>{l.ip || ''}</td>
              </tr>
            );
          })}
        </Table>
      )}
      {logs && logs.length >= 500 && <p className="text-xs text-slate-400 mt-3">Showing the newest 500. Filter by user or type to see older ones.</p>}
    </Card>
  );
}
