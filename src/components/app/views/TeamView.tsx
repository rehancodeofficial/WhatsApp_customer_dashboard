'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Check, KeyRound, Plus, ShieldCheck, Trash2, UserCheck, UserX, Clock, CheckCircle2, ShieldAlert } from 'lucide-react';
import { PERMISSION_GROUPS } from '@/lib/permissions';
import { api, Avatar, Button, Card, CardHeader, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, PillTabs, StatusDot, Table, td } from '../ui';
import { ActivityTab, CodeInput, SecurityTab, sixDigits } from './TeamSecurity';

interface Role { id: string; name: string; description: string | null; permissions: string[] }
interface Staff { id: string; email: string; full_name: string; role: 'owner' | 'agent'; role_id: string | null; active: boolean; created_at: string; last_sign_in_at?: string | null }
interface PasswordResetRequest {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  reason?: string | null;
  verification_notes?: string | null;
  temporary_password?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function TeamView({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<'users' | 'security' | 'activity' | 'roles' | 'resets'>('users');
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<Role | 'new' | null>(null);
  const [addUser, setAddUser] = useState(false);
  const [pwFor, setPwFor] = useState<Staff | null>(null);
  const [verifyModalReq, setVerifyModalReq] = useState<PasswordResetRequest | null>(null);
  const [completedCreds, setCompletedCreds] = useState<{ name: string; email: string; password: string } | null>(null);

  const load = useCallback(() => {
    api<{ roles: Role[] }>('/api/roles').then((d) => setRoles(d.roles)).catch((e) => setErr(e.message));
    api<{ staff: Staff[] }>('/api/staff').then((d) => setStaff(d.staff)).catch((e) => setErr(e.message));
    api<{ requests: PasswordResetRequest[] }>('/api/staff/reset-requests')
      .then((d) => setResetRequests(d.requests))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setErr(null);
    setOk(null);
    try {
      await fn();
      setOk(msg);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const pendingCount = resetRequests?.filter((r) => r.status === 'pending').length || 0;

  return (
    <div className="h-full overflow-y-auto pr-1">
      <PageHeader
        title="Team & Access"
        subtitle="Only the Admin (owner) creates users, configures roles, and verifies password reset requests."
        right={
          <>
            <PillTabs
              value={tab}
              onChange={(t) => setTab(t as typeof tab)}
              items={[
                { id: 'users', label: 'Users', count: staff?.length },
                { id: 'security', label: 'Security' },
                { id: 'activity', label: 'Activity log' },
                { id: 'roles', label: 'Roles & permissions', count: roles?.length },
                { id: 'resets', label: 'Reset requests', count: pendingCount > 0 ? pendingCount : undefined },
              ]}
            />
            {tab === 'users' && (
              <Button onClick={() => setAddUser(true)}><Plus className="w-4 h-4" /> Add user</Button>
            )}
            {tab === 'roles' && (
              <Button onClick={() => setEditRole('new')}><Plus className="w-4 h-4" /> New role</Button>
            )}
          </>
        }
      />
      <ErrorNote text={err} />
      {ok && <div className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2.5 mb-4">{ok}</div>}

      {tab === 'security' && <SecurityTab />}
      {tab === 'activity' && <ActivityTab users={(staff || []).map((u) => ({ id: u.id, name: u.full_name }))} />}

      {tab === 'users' && (
        <Card>
          {!staff || !roles ? (
            <Loading />
          ) : (
            <Table head={['User', 'Role', 'Status', 'Last sign-in', '']} minWidth={760}>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <Avatar name={s.full_name} size={36} />
                      <div>
                        <div className="font-medium text-slate-800">{s.full_name} {s.id === currentUserId && <span className="text-xs text-slate-400">(you)</span>}</div>
                        <div className="text-xs text-slate-500">{s.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className={td}>
                    <select
                      className={cx(inputCls, 'rounded-full py-1.5 w-52')}
                      value={s.role === 'owner' ? 'owner' : s.role_id || ''}
                      disabled={s.id === currentUserId}
                      onChange={(e) => {
                        const v = e.target.value;
                        run(
                          () => api(`/api/staff/${s.id}`, { method: 'PATCH', body: JSON.stringify(v === 'owner' ? { role: 'owner' } : { role: 'agent', role_id: v || null }) }),
                          `${s.full_name} is now ${v === 'owner' ? 'Admin' : roles.find((r) => r.id === v)?.name || 'without a role'}`
                        );
                      }}
                      aria-label="Role"
                    >
                      <option value="owner">Admin (full access)</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                      <option value="">No role (no access)</option>
                    </select>
                  </td>
                  <td className={td}>{s.active ? <StatusDot color="green" label="Active" /> : <StatusDot color="gray" label="Deactivated" />}</td>
                  <td className={cx(td, 'text-slate-500 text-xs')}>{s.last_sign_in_at ? dateTime(s.last_sign_in_at) : 'Never'}</td>
                  <td className={cx(td, 'text-right whitespace-nowrap')}>
                    {s.id !== currentUserId && (
                      <>
                        <IconBtn label="Reset password" onClick={() => setPwFor(s)}><KeyRound className="w-3.5 h-3.5" /></IconBtn>
                        <IconBtn label={s.active ? 'Deactivate' : 'Activate'} onClick={() => run(() => api(`/api/staff/${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: !s.active }) }), s.active ? 'User deactivated' : 'User activated')}>
                          {s.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </IconBtn>
                        <IconBtn label="Delete" danger onClick={() => confirm(`Delete ${s.full_name}? They lose access immediately.`) && run(() => api(`/api/staff/${s.id}`, { method: 'DELETE' }), 'User deleted')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconBtn>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'roles' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="bg-slate-800 border-slate-800 text-white">
            <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-orange-400" /><h3 className="font-semibold">Admin (owner)</h3></div>
            <p className="text-sm text-slate-300 mt-2">Everything, always: all records, broadcasts, users, roles and settings. Cannot be limited.</p>
          </Card>
          {!roles ? (
            <Loading />
          ) : (
            roles.map((r) => (
              <Card key={r.id} className="flex flex-col">
                <CardHeader title={r.name} subtitle={r.description || undefined} right={<Button size="sm" variant="light" onClick={() => setEditRole(r)}>Edit</Button>} />
                <div className="text-xs text-slate-500 mb-2">{r.permissions.length} permissions · {staff?.filter((s) => s.role_id === r.id && s.role !== 'owner').length ?? 0} users</div>
                <div className="flex flex-wrap gap-1">
                  {PERMISSION_GROUPS.flatMap((g) => g.items as readonly { key: string; label: string; hint: string }[])
                    .filter((i) => r.permissions.includes(i.key))
                    .map((i) => (
                      <span key={i.key} className="inline-flex items-center gap-1 text-[11px] rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">
                        <Check className="w-3 h-3 text-emerald-600" /> {i.label}
                      </span>
                    ))}
                  {!r.permissions.length && <span className="text-xs text-slate-400">No permissions</span>}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'resets' && (
        <Card>
          {!resetRequests ? (
            <Loading />
          ) : resetRequests.length === 0 ? (
            <Empty title="No password reset requests" text="When a team member requests a password reset from the login screen, it will appear here for verification." />
          ) : (
            <Table head={['Staff Member', 'Reason / Note', 'Requested', 'Status', 'Verification & Action']} minWidth={760}>
              {resetRequests.map((req) => (
                <tr key={req.id}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <Avatar name={req.full_name} size={36} />
                      <div>
                        <div className="font-medium text-slate-800">{req.full_name}</div>
                        <div className="text-xs text-slate-500">{req.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className={cx(td, 'text-xs text-slate-600 max-w-xs truncate')}>
                    {req.reason || <span className="text-slate-400 italic">None provided</span>}
                  </td>
                  <td className={cx(td, 'text-xs text-slate-500')}>
                    {dateTime(req.created_at)}
                  </td>
                  <td className={td}>
                    {req.status === 'pending' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="w-3 h-3" /> Pending Review
                      </span>
                    ) : req.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" /> Fulfilled
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">{req.status}</span>
                    )}
                  </td>
                  <td className={cx(td, 'text-right')}>
                    {req.status === 'pending' ? (
                      <Button size="sm" onClick={() => setVerifyModalReq(req)}>
                        <ShieldAlert className="w-3.5 h-3.5 mr-1" /> Verify & Issue Password
                      </Button>
                    ) : (
                      <div className="text-xs text-slate-400">
                        Verified {req.reviewed_at ? dateTime(req.reviewed_at) : ''}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {editRole && (
        <RoleModal
          role={editRole === 'new' ? null : editRole}
          onClose={() => setEditRole(null)}
          onSaved={(m) => {
            setEditRole(null);
            setOk(m);
            load();
          }}
        />
      )}
      {addUser && roles && (
        <UserModal
          roles={roles}
          onClose={() => setAddUser(false)}
          onSaved={() => {
            setAddUser(false);
            setOk('User created. Share the email and password with them.');
            load();
          }}
        />
      )}
      {pwFor && (
        <PasswordModal
          user={pwFor}
          onClose={() => setPwFor(null)}
          onSaved={() => {
            setPwFor(null);
            setOk('Password changed');
          }}
        />
      )}
      {verifyModalReq && (
        <VerifyAndResetModal
          request={verifyModalReq}
          onClose={() => setVerifyModalReq(null)}
          onSuccess={(creds) => {
            setVerifyModalReq(null);
            setCompletedCreds(creds);
            load();
          }}
        />
      )}
      {completedCreds && (
        <Modal open onClose={() => setCompletedCreds(null)} title="Credentials Ready to Share">
          <div className="space-y-4 text-xs">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-900">
              Identity verified and new password set successfully for <b>{completedCreds.name}</b>.
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 font-mono">
              <div><b>Email:</b> {completedCreds.email}</div>
              <div><b>New Password:</b> {completedCreds.password}</div>
            </div>
            <p className="text-slate-500">
              Please convey this temporary password to <b>{completedCreds.name}</b> directly via trusted internal channels (WhatsApp, in person, or voice call).
            </p>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setCompletedCreds(null)}>Done</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const IconBtn = ({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} title={label} aria-label={label} className={cx('w-8 h-8 rounded-full inline-flex items-center justify-center ml-1', danger ? 'hover:bg-rose-50 text-rose-500' : 'hover:bg-slate-100 text-slate-600')}>
    {children}
  </button>
);

function VerifyAndResetModal({
  request,
  onClose,
  onSuccess,
}: {
  request: PasswordResetRequest;
  onClose: () => void;
  onSuccess: (creds: { name: string; email: string; password: string }) => void;
}) {
  const [pw, setPw] = useState('');
  const [notes, setNotes] = useState('Identity verified by Admin');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let res = '';
    for (let i = 0; i < 10; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPw(res);
  };

  useEffect(() => {
    generateRandomPassword();
  }, []);

  const handleFulfill = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/staff/reset-requests', {
        method: 'POST',
        body: JSON.stringify({
          requestId: request.id,
          newPassword: pw,
          verificationNotes: notes,
          code,
        }),
      });
      onSuccess({ name: request.full_name, email: request.email, password: pw });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Verify & Reset: ${request.full_name}`}>
      <ErrorNote text={err} />
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
          <div><b>User:</b> {request.full_name} ({request.email})</div>
          <div><b>Reason:</b> {request.reason || 'None provided'}</div>
          <div><b>Requested at:</b> {dateTime(request.created_at)}</div>
        </div>

        <Field label="Verification Check & Notes">
          <input
            className={inputCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Identity verified via phone call / internal chat"
          />
        </Field>

        <Field
          label="New Password for User"
          hint="Must be at least 8 characters. Share this password directly with the team member."
        >
          <div className="flex gap-2">
            <input
              type="text"
              className={cx(inputCls, 'font-mono text-sm')}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <Button variant="light" size="sm" onClick={generateRandomPassword}>Generate</Button>
          </div>
        </Field>

        <Field label="Your Microsoft Authenticator code" hint="Needed to set anyone's password.">
          <CodeInput value={code} onChange={setCode} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="light" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleFulfill} loading={busy} disabled={pw.length < 8 || !sixDigits(code)}>
            Confirm & Issue Password
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RoleModal({ role, onClose, onSaved }: { role: Role | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions || []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (k: string) => {
    const n = new Set(perms);
    n.has(k) ? n.delete(k) : n.add(k);
    setPerms(n);
  };
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(role ? `/api/roles/${role.id}` : '/api/roles', { method: role ? 'PATCH' : 'POST', body: JSON.stringify({ name, description: description || null, permissions: Array.from(perms) }) });
      onSaved(role ? 'Role updated. It applies on the users’ next page load.' : 'Role created');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!role || !confirm(`Delete role "${role.name}"? Users on it lose all access until you give them another role.`)) return;
    try {
      await api(`/api/roles/${role.id}`, { method: 'DELETE' });
      onSaved('Role deleted');
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <Modal open onClose={onClose} title={role ? `Edit role: ${role.name}` : 'New role'} wide>
      <ErrorNote text={err} />
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <Field label="Role name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales Manager" /></Field>
        <Field label="Description"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-slate-500 mb-3">Tick exactly what this role may do. Anything not ticked is blocked on the server, not just hidden.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.group} className="rounded-2xl border border-slate-200/70 p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{g.group}</div>
            {g.items.map((i) => (
              <label key={i.key} className="flex items-start gap-2.5 py-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.has(i.key)} onChange={() => toggle(i.key)} className="mt-0.5 w-4 h-4 accent-orange-500" />
                <span>
                  <span className="block text-sm text-slate-800">{i.label}</span>
                  <span className="block text-[11px] text-slate-500">{i.hint}</span>
                </span>
              </label>
            ))}
          </div>
        ))}
        <div className="rounded-2xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
          <b className="text-slate-700">Admin only</b> (never grantable): manage users & roles, settings.
        </div>
      </div>
      <div className="flex justify-between mt-5">
        {role ? <Button variant="danger" onClick={remove}>Delete role</Button> : <span />}
        <Button onClick={save} loading={busy} disabled={!name.trim()}>Save role</Button>
      </div>
    </Modal>
  );
}

function UserModal({ roles, onClose, onSaved }: { roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: roles[0]?.id || 'owner' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/staff', {
        method: 'POST',
        body: JSON.stringify({ full_name: f.full_name, email: f.email, password: f.password, ...(f.role === 'owner' ? { role: 'owner' } : { role: 'agent', role_id: f.role }) }),
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Add user">
      <ErrorNote text={err} />
      <div className="space-y-3">
        <Field label="Full name"><input className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" hint="At least 8 characters. Share it with the user privately."><input type="password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Role">
          <select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
            <option value="owner">Admin (full access)</option>
          </select>
        </Field>
        <div className="flex justify-end pt-2">
          <Button onClick={save} loading={busy}>Create user</Button>
        </div>
      </div>
    </Modal>
  );
}

function PasswordModal({ user, onClose, onSaved }: { user: Staff; onClose: () => void; onSaved: () => void }) {
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/staff/${user.id}`, { method: 'PATCH', body: JSON.stringify({ password: pw, code }) });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`New password for ${user.full_name}`}>
      <ErrorNote text={err} />
      <div className="space-y-3">
        <Field label="New password" hint="At least 8 characters"><input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Your Microsoft Authenticator code" hint="Needed to change anyone's password."><CodeInput value={code} onChange={setCode} /></Field>
      </div>
      <div className="flex justify-end mt-4"><Button onClick={save} loading={busy} disabled={pw.length < 8 || !sixDigits(code)}>Save</Button></div>
    </Modal>
  );
}
