'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, KeyRound, Trash2, Loader2, UserX, UserCheck } from 'lucide-react';
import { ROLE_LABEL, type Role } from '@/lib/permissions';

interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
  last_sign_in_at?: string | null;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : 'Never');

// Admin-only page: add staff, choose Admin or Management, deactivate, reset password, delete.
export function StaffManagement({ currentUserId }: { currentUserId: string }) {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'agent' as Role });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await call<{ staff: StaffUser[] }>('/api/staff');
      setStaff(d.staff);
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: 'ok', text: ok });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await run(() => call('/api/staff', { method: 'POST', body: JSON.stringify(form) }), `Account created for ${form.email}`);
    setForm({ full_name: '', email: '', password: '', role: 'agent' });
    setBusy(false);
  };

  const patch = (u: StaffUser, body: Record<string, unknown>, ok: string) =>
    run(() => call(`/api/staff/${u.id}`, { method: 'PATCH', body: JSON.stringify(body) }), ok);

  const resetPassword = (u: StaffUser) => {
    const pw = window.prompt(`New password for ${u.email} (at least 8 characters):`);
    if (pw) patch(u, { password: pw }, `Password changed for ${u.email}`);
  };

  const remove = (u: StaffUser) => {
    if (window.confirm(`Delete ${u.full_name} (${u.email})? They will lose access. This cannot be undone.`)) {
      run(() => call(`/api/staff/${u.id}`, { method: 'DELETE' }), `${u.email} deleted`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-orange-600" /> Staff & access
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            <b>Admin</b>: full access (staff accounts, payments, analytics, settings). <b>Management</b>: all chats, AI on/off and
            replying to customers only.
          </p>
        </div>

        {msg && (
          <div className={`text-xs rounded-lg px-3 py-2 border ${msg.kind === 'ok' ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={add} className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <label className="text-xs text-slate-600 md:col-span-1">
            Name
            <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-600 md:col-span-1">
            Email
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-600 md:col-span-1">
            Password
            <input required minLength={8} type="text" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-600 md:col-span-1">
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white">
              <option value="agent">Management</option>
              <option value="owner">Admin</option>
            </select>
          </label>
          <button disabled={busy} className="rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold py-2 flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Add staff
          </button>
        </form>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 text-xs text-slate-400">Loading staff...</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {staff.map((u) => {
                const me = u.id === currentUserId;
                return (
                  <li key={u.id} className={`p-4 flex flex-col md:flex-row md:items-center gap-3 ${u.active ? '' : 'opacity-60'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                        {u.full_name} {me && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">You</span>}
                        {!u.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">Deactivated</span>}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{u.email}</div>
                      <div className="text-[11px] text-slate-400">Last sign-in: {fmt(u.last_sign_in_at)}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        aria-label={`Role for ${u.email}`}
                        value={u.role}
                        onChange={(e) => patch(u, { role: e.target.value }, `${u.email} is now ${ROLE_LABEL[e.target.value as Role]}`)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white"
                      >
                        <option value="owner">Admin</option>
                        <option value="agent">Management</option>
                      </select>
                      <button onClick={() => resetPassword(u)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5" /> Password
                      </button>
                      {!me && (
                        <button
                          onClick={() => patch(u, { active: !u.active }, u.active ? `${u.email} deactivated` : `${u.email} activated`)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-1"
                        >
                          {u.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      {!me && (
                        <button onClick={() => remove(u)} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
