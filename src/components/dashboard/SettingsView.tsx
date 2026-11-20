'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Mail, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { api, Button, Card, CardHeader, Chip, ErrorNote, Field, inputCls, PillTabs } from '@/components/app/ui';

type Tab = 'profile' | 'security';
interface Profile {
  name: string;
  email: string;
  role: string;
  recovery_email: string | null;
}

// Settings: Profile (name, recovery email, password) and Security (two-factor with Microsoft Authenticator).
// Secrets are never sent to the browser.
export function SettingsView({ demo }: { demo: boolean; whatsappLive?: boolean }) {
  const [tab, setTab] = useState<Tab>('profile');
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <PillTabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { id: 'profile', label: 'Profile' },
            { id: 'security', label: 'Security' },
          ]}
        />
        {tab === 'profile' && <ProfileTab />}
        {tab === 'security' && <SecurityTab demo={demo} />}
      </div>
    </div>
  );
}

function Saved({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2.5 mb-4 flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4" /> {text}
    </div>
  );
}

/** Two-factor on? Then profile and password changes need a code from the app. */
function useMfaOn() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    api<{ enabled: boolean }>('/api/auth/mfa').then((d) => setOn(!!d.enabled)).catch(() => {});
  }, []);
  return on;
}

function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Authenticator code" hint="Two-factor is on: enter the current 6-digit code from Microsoft Authenticator to save.">
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        className={inputCls + ' font-mono tracking-[0.3em] text-center sm:w-40'}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9 ]/g, ''))}
        placeholder="123 456"
      />
    </Field>
  );
}

function ProfileTab() {
  const [p, setP] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const mfaOn = useMfaOn();
  const [code, setCode] = useState('');

  useEffect(() => {
    api<Profile>('/api/me/profile')
      .then((d) => {
        setP(d);
        setName(d.name);
        setRecovery(d.recovery_email || '');
      })
      .catch((e) => setErr(e.message));
  }, []);

  const save = async () => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const body: Record<string, string> = { name };
      if (p?.role === 'owner') body.recovery_email = recovery.trim();
      if (mfaOn) body.code = code;
      await api('/api/me/profile', { method: 'PATCH', body: JSON.stringify(body) });
      setCode('');
      setOk('Profile saved.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader title="Profile" subtitle="Your name and sign-in details" right={p && <Chip tone={p.role === 'owner' ? 'orange' : 'slate'}>{p.role === 'owner' ? 'Admin' : 'Staff'}</Chip>} />
        <ErrorNote text={err} />
        <Saved text={ok} />
        <div className="space-y-3">
          <Field label="Full name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Sign-in email" hint="Used to sign in. Ask support to change it.">
            <input className={inputCls + ' bg-slate-50 text-slate-500'} value={p?.email || ''} readOnly />
          </Field>
          {p?.role === 'owner' && (
            <Field label="Recovery email (Outlook)" hint="“Forgot password?” sends a reset link here. The link works once and expires after 15 minutes.">
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input className={inputCls + ' pl-9'} type="email" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="name@hotmail.com" />
              </div>
            </Field>
          )}
          {mfaOn && <CodeField value={code} onChange={setCode} />}
          <div className="flex justify-end">
            <Button onClick={save} loading={busy} disabled={!p || (mfaOn && code.replace(/\s/g, '').length !== 6)}>
              Save profile
            </Button>
          </div>
        </div>
      </Card>
      <ChangePassword />
    </>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ current: '', password: '', repeat: '' });
  const mfaOn = useMfaOn();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const save = async () => {
    setErr(null);
    setOk(null);
    if (f.password.length < 8) return setErr('New password: at least 8 characters.');
    if (f.password !== f.repeat) return setErr('The two new passwords are not the same.');
    setBusy(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ current: f.current, password: f.password, ...(mfaOn ? { code } : {}) }) });
      setF({ current: '', password: '', repeat: '' });
      setCode('');
      setOk('Password changed.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Change password" subtitle="You need your current password" />
      <ErrorNote text={err} />
      <Saved text={ok} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Current password"><input type="password" autoComplete="current-password" className={inputCls} value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
        <Field label="New password"><input type="password" autoComplete="new-password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Repeat new password"><input type="password" autoComplete="new-password" className={inputCls} value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} /></Field>
      </div>
      {mfaOn && (
        <div className="mt-3">
          <CodeField value={code} onChange={setCode} />
        </div>
      )}
      <div className="flex justify-end mt-3">
        <Button onClick={save} loading={busy} disabled={!f.current || !f.password || (mfaOn && code.replace(/\s/g, '').length !== 6)}>
          <KeyRound className="w-4 h-4" /> Change password
        </Button>
      </div>
    </Card>
  );
}

function SecurityTab({ demo }: { demo: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  const load = () => api<{ enabled: boolean }>('/api/auth/mfa').then((d) => setEnabled(d.enabled)).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);

  const start = async () => {
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      setSetup(await api('/api/auth/mfa/enroll', { method: 'POST' }));
      setCode('');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const activate = async () => {
    if (!setup) return;
    setErr(null);
    setBusy(true);
    try {
      await api('/api/auth/mfa/activate', { method: 'POST', body: JSON.stringify({ factorId: setup.factorId, code }) });
      setSetup(null);
      setCode('');
      setOk('Two-factor sign-in is on. From now on, sign-in asks for the code from Microsoft Authenticator.');
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api('/api/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) });
      setDisabling(false);
      setCode('');
      setOk('Two-factor sign-in is off.');
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const codeInput = (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={7}
      className={inputCls + ' font-mono tracking-[0.3em] text-center text-base sm:w-40'}
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ''))}
      placeholder="123 456"
    />
  );

  return (
    <Card>
      <CardHeader
        title="Two-factor sign-in"
        subtitle="After your password, sign-in also asks for a 6-digit code from Microsoft Authenticator on your phone"
        right={enabled === null ? null : enabled ? <Chip tone="green">On</Chip> : <Chip tone="amber">Off</Chip>}
      />
      <ErrorNote text={err} />
      <Saved text={ok} />
      {demo ? (
        <p className="text-sm text-slate-500">Not available in demo mode.</p>
      ) : enabled === null ? null : enabled ? (
        !disabling ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Your account is protected with Microsoft Authenticator.
            </p>
            <Button variant="light" onClick={() => { setDisabling(true); setCode(''); setOk(null); }}>
              <ShieldOff className="w-4 h-4" /> Turn off
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Enter the current code from the app to turn two-factor sign-in off.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              {codeInput}
              <Button onClick={disable} loading={busy} disabled={code.replace(/\s/g, '').length !== 6}>Turn off</Button>
              <Button variant="light" onClick={() => setDisabling(false)}>Cancel</Button>
            </div>
          </div>
        )
      ) : !setup ? (
        <div className="space-y-3">
          <ol className="text-sm text-slate-600 list-decimal pl-5 space-y-1">
            <li>Install <b>Microsoft Authenticator</b> on your phone (App Store / Google Play).</li>
            <li>Press <b>Set up</b> below and scan the QR code with the app (+ → Other account).</li>
            <li>Type the 6-digit code the app shows to finish.</li>
          </ol>
          <div className="flex justify-end">
            <Button onClick={start} loading={busy}>
              <Smartphone className="w-4 h-4" /> Set up
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
            {/* Supabase returns the QR code as an SVG data URL. */}
            <img src={setup.qr} alt="QR code for Microsoft Authenticator" className="w-44 h-44 rounded-2xl border border-slate-200 p-2 bg-white" />
            <div className="text-sm text-slate-600 space-y-2 min-w-0">
              <p>In Microsoft Authenticator: <b>+</b> → <b>Other account (Google, Facebook, etc.)</b> → scan this code.</p>
              <p className="text-xs text-slate-500">Can't scan? Choose “Enter code manually” and type this key:</p>
              <code className="block text-xs font-mono bg-slate-100 rounded-lg px-3 py-2 break-all select-all">{setup.secret}</code>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <Field label="6-digit code from the app">{codeInput}</Field>
            <Button onClick={activate} loading={busy} disabled={code.replace(/\s/g, '').length !== 6}>Turn on</Button>
            <Button variant="light" onClick={() => setSetup(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
