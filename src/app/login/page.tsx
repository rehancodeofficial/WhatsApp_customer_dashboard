'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff, KeyRound, ArrowLeft, CheckCircle2, ShieldCheck, Mail, Send, X } from 'lucide-react';

const DEMO = [
  { label: 'Admin (full access)', email: 'admin@phonebuzz.demo', password: 'Admin@123' },
  { label: 'Management (chats only)', email: 'management@phonebuzz.demo', password: 'Manage@123' },
];

type Mode =
  | 'login' // username + password
  | 'mfa' // 6-digit code from Microsoft Authenticator
  | 'mfa-email' // Admin: another method → recovery email → code by email
  | 'forgot' // username → choose how to reset
  | 'forgot-email' // Admin: confirm recovery email → reset link
  | 'forgot-auth' // anyone with the app: code + new password
  | 'forgot-request'; // staff: ask the Admin

interface ForgotOptions {
  kind: 'owner' | 'staff';
  authenticator: boolean;
  recoveryEmail?: string | null;
}

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const codeField = field + ' text-center font-mono tracking-[0.4em] text-lg';
const primary = 'w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 disabled:opacity-60';
const six = (c: string) => c.replace(/\s/g, '').length === 6;
const digits = (v: string) => v.replace(/[^0-9 ]/g, '');

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function Back({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1">
      <ArrowLeft className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function Done({ title, text, onBack }: { title: string; text: string; onBack: () => void }) {
  return (
    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-xs space-y-2">
      <div className="flex items-center gap-2 font-semibold text-sm text-emerald-900">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {title}
      </div>
      <p>{text}</p>
      <button type="button" onClick={onBack} className="mt-2 w-full py-2 bg-emerald-600 text-white rounded-lg font-semibold text-xs hover:bg-emerald-700">
        Back to sign in
      </button>
    </div>
  );
}

function Choice({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 rounded-xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50 px-3 py-3 text-left">
      <span className="shrink-0 text-orange-600">{icon}</span>
      <span className="text-xs text-slate-600">
        <b className="block text-sm text-slate-800">{title}</b>
        {text}
      </span>
    </button>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mfa') === '1' ? 'mfa' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  // second step
  const [code, setCode] = useState('');
  const [emailOption, setEmailOption] = useState(params.get('mfa') === '1');
  const [recovery, setRecovery] = useState('');
  const [emailCodeSentTo, setEmailCodeSentTo] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState('');
  // forgot password
  const [opts, setOpts] = useState<ForgotOptions | null>(null);
  const [reason, setReason] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setDemo(!!d.demo))
      .catch(() => {});
    fetch('/api/auth/setup')
      .then((r) => r.json())
      .then((d) => {
        setNeedsSetup(!!d.needsSetup);
        if (d.error) setSetupError(d.error);
      })
      .catch(() => {});
  }, []);

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setDone(null);
  };

  const goNext = () => {
    const next = params.get('next');
    window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError('Unable to reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // ---------- sign in ----------
  const signIn = (e?: React.FormEvent, creds?: { username: string; password: string }) => {
    e?.preventDefault();
    return run(async () => {
      const r = await post('/api/auth/login', creds || { username, password });
      if (!r.ok) return setError(r.data.error || 'Sign-in failed');
      if (r.data.mfa_required) {
        setEmailOption(!!r.data.email_option);
        setCode('');
        return go('mfa');
      }
      goNext();
    });
  };

  const verifyApp = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post('/api/auth/mfa/verify', { code });
      if (!r.ok) {
        setError(r.data.error || 'Wrong code');
        if (r.status === 401 && /expired/i.test(r.data.error || '')) go('login');
        return;
      }
      goNext();
    });
  };

  const sendEmailCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const r = await post('/api/auth/mfa/email/send', { email: recovery });
      if (!r.ok) return setError(r.data.error || 'Could not send the code');
      setEmailCode('');
      setEmailCodeSentTo(r.data.to);
    });
  };

  const verifyEmailCode = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post('/api/auth/mfa/email/verify', { code: emailCode });
      if (!r.ok) return setError(r.data.error || 'Wrong code');
      goNext();
    });
  };

  const cancelSecondStep = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setCode('');
    setPassword('');
    setEmailCodeSentTo(null);
    go('login');
  };

  // ---------- forgot password ----------
  const findOptions = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post('/api/auth/forgot-options', { username });
      if (!r.ok) return setError(r.data.error || 'Could not find this account');
      setOpts(r.data);
    });
  };

  const sendResetLink = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post('/api/auth/forgot-password', { username, recovery_email: recovery });
      if (!r.ok) return setError(r.data.error || 'Could not send the link');
      setDone({ title: 'Reset link sent', text: r.data.message || 'Check your recovery email. The link works once and expires in 15 minutes.' });
    });
  };

  const resetWithApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) return setError('New password: at least 8 characters.');
    if (newPw !== newPw2) return setError('The two new passwords are not the same.');
    return run(async () => {
      const r = await post('/api/auth/reset-with-code', { email: username, code, password: newPw });
      if (!r.ok) return setError(r.data.error || 'Could not reset the password');
      setNewPw('');
      setNewPw2('');
      setCode('');
      setDone({ title: 'Password changed', text: 'Sign in with your username and the new password.' });
    });
  };

  const requestAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post('/api/auth/forgot-password', { username, reason });
      if (!r.ok) return setError(r.data.error || 'Could not send the request');
      setDone({ title: 'Request sent', text: r.data.message || 'The Admin will verify you and give you a new password.' });
    });
  };

  // ---------- first Admin ----------
  const createFirstAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await post('/api/auth/setup', { full_name: name, email: setupEmail, password });
      if (!r.ok) return setError(r.data.error || 'Could not create the account');
      setNeedsSetup(false);
      await signIn(undefined, { username: setupEmail, password });
    });
  };

  const err = error && <p className="text-xs text-red-600">{error}</p>;

  if (needsSetup) {
    return (
      <form onSubmit={createFirstAdmin} className="space-y-4">
        <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-900">
          <b>First-time setup.</b> No staff account exists yet. Create the first <b>Admin</b> account. After this, only an Admin can add more staff.
        </div>
        <input id="setup-name" required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <input id="setup-email" required type="email" placeholder="Email" autoComplete="email" value={setupEmail} onChange={(e) => setSetupEmail(e.target.value)} className={field} />
        <input id="setup-password" required minLength={8} type="password" placeholder="Password (8+ characters)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        {err}
        <button type="submit" disabled={busy} className={primary}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create Admin account
        </button>
      </form>
    );
  }

  // ---------- step 2: authenticator code ----------
  if (mode === 'mfa') {
    return (
      <form onSubmit={verifyApp} className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-orange-50 border border-orange-200 p-3">
          <ShieldCheck className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-700">
            Open <b>Microsoft Authenticator</b> on your phone and enter the 6-digit code for <b>Phone Buzz Dashboard</b>.
          </p>
        </div>
        <div>
          <Label htmlFor="code">Authenticator code</Label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7} required value={code} onChange={(e) => setCode(digits(e.target.value))} placeholder="123 456" className={codeField} />
        </div>
        {err}
        <button type="submit" disabled={busy || !six(code)} className={primary}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Verify and sign in
        </button>
        {emailOption && (
          <button type="button" onClick={() => { setRecovery(''); setEmailCodeSentTo(null); go('mfa-email'); }} className="w-full text-xs font-semibold text-orange-600 hover:text-orange-700">
            No code? Use another method
          </button>
        )}
        <button type="button" onClick={cancelSecondStep} className="w-full text-xs text-slate-500 hover:text-slate-700">
          Use a different account
        </button>
      </form>
    );
  }

  // ---------- step 2 (Admin): recovery email ----------
  if (mode === 'mfa-email') {
    return (
      <div className="space-y-4">
        <Back onClick={() => go('mfa')} label="Back to authenticator code" />
        <form onSubmit={sendEmailCode} className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
            <Mail className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700">Type your <b>recovery email</b>. If it matches the one saved for this Admin account, we send a 6-digit code to it.</p>
          </div>
          <div>
            <Label htmlFor="recovery">Recovery email</Label>
            <input id="recovery" type="email" required autoFocus autoComplete="email" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="name@hotmail.com" className={field} />
          </div>
          {!emailCodeSentTo && err}
          <button type="submit" disabled={busy || !recovery} className={primary}>
            {busy && !emailCodeSentTo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Confirm email and send code
          </button>
        </form>

        {emailCodeSentTo && (
          // Popup: enter the code that was emailed.
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" role="dialog" aria-modal="true" aria-labelledby="ecode-title">
            <form onSubmit={verifyEmailCode} className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 id="ecode-title" className="text-base font-bold text-slate-800">Enter verification code</h2>
                <button type="button" onClick={() => { setEmailCodeSentTo(null); setError(null); }} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-600">
                We sent a 6-digit code to <b>{emailCodeSentTo}</b>. It expires in 10 minutes. Check the spam folder too.
              </p>
              <input id="ecode" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7} required value={emailCode} onChange={(e) => setEmailCode(digits(e.target.value))} placeholder="123 456" className={codeField} />
              {err}
              <button type="submit" disabled={busy || !six(emailCode)} className={primary}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Verify and sign in
              </button>
              <button type="button" disabled={busy} onClick={() => sendEmailCode()} className="w-full text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50">
                Send a new code
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ---------- forgot password ----------
  if (mode === 'forgot') {
    return (
      <div className="space-y-4">
        <Back onClick={() => { setOpts(null); go('login'); }} label="Back to sign in" />
        {!opts ? (
          <form onSubmit={findOptions} className="space-y-3">
            <p className="text-xs text-slate-600">Enter your username. We show the ways you can reset your password.</p>
            <div>
              <Label htmlFor="f-username">Username</Label>
              <input id="f-username" required autoFocus autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} className={field} />
            </div>
            {err}
            <button type="submit" disabled={busy || !username.trim()} className={primary}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Continue
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Reset the password of <b>{username}</b> ({opts.kind === 'owner' ? 'Admin' : 'Staff'}):
            </p>
            {opts.kind === 'owner' && (
              <Choice
                icon={<Mail className="w-5 h-5" />}
                title="Email me a reset link"
                text={opts.recoveryEmail ? `Confirm your recovery email (${opts.recoveryEmail}) and get a link valid for 15 minutes.` : 'No recovery email is saved for this account.'}
                onClick={() => { setRecovery(''); go('forgot-email'); }}
              />
            )}
            {opts.authenticator && (
              <Choice icon={<ShieldCheck className="w-5 h-5" />} title="Use Microsoft Authenticator" text="Enter the 6-digit code from the app and choose a new password." onClick={() => { setCode(''); go('forgot-auth'); }} />
            )}
            {opts.kind === 'staff' && (
              <Choice icon={<KeyRound className="w-5 h-5" />} title="Ask the Admin" text="The Admin verifies you and gives you a new password." onClick={() => { setReason(''); go('forgot-request'); }} />
            )}
            {err}
            <button type="button" onClick={() => setOpts(null)} className="w-full text-xs text-slate-500 hover:text-slate-700">
              Not {username}? Change username
            </button>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'forgot-email') {
    return (
      <div className="space-y-4">
        <Back onClick={() => go('forgot')} />
        {done ? (
          <Done title={done.title} text={done.text} onBack={() => { setOpts(null); go('login'); }} />
        ) : (
          <form onSubmit={sendResetLink} className="space-y-3">
            <p className="text-xs text-slate-600">Type the recovery email saved for this Admin account{opts?.recoveryEmail ? ` (${opts.recoveryEmail})` : ''}. The reset link goes there and works once for 15 minutes.</p>
            <div>
              <Label htmlFor="fe-email">Recovery email</Label>
              <input id="fe-email" type="email" required autoFocus value={recovery} onChange={(e) => setRecovery(e.target.value)} className={field} />
            </div>
            {err}
            <button type="submit" disabled={busy || !recovery} className={primary}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Confirm email and send link
            </button>
          </form>
        )}
      </div>
    );
  }

  if (mode === 'forgot-auth') {
    return (
      <div className="space-y-4">
        <Back onClick={() => go('forgot')} />
        {done ? (
          <Done title={done.title} text={done.text} onBack={() => { setOpts(null); go('login'); }} />
        ) : (
          <form onSubmit={resetWithApp} className="space-y-3">
            <p className="text-xs text-slate-500">Use the current code for <b>Phone Buzz Dashboard</b> in Microsoft Authenticator. 3 wrong codes block the account.</p>
            <div>
              <Label htmlFor="fa-code">Authenticator code</Label>
              <input id="fa-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7} required value={code} onChange={(e) => setCode(digits(e.target.value))} placeholder="123 456" className={codeField} />
            </div>
            <div>
              <Label htmlFor="fa-pw">New password</Label>
              <input id="fa-pw" type="password" autoComplete="new-password" required value={newPw} onChange={(e) => setNewPw(e.target.value)} className={field} />
            </div>
            <div>
              <Label htmlFor="fa-pw2">Repeat new password</Label>
              <input id="fa-pw2" type="password" autoComplete="new-password" required value={newPw2} onChange={(e) => setNewPw2(e.target.value)} className={field} />
            </div>
            {err}
            <button type="submit" disabled={busy || !six(code)} className={primary}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Reset password
            </button>
          </form>
        )}
      </div>
    );
  }

  if (mode === 'forgot-request') {
    return (
      <div className="space-y-4">
        <Back onClick={() => go('forgot')} />
        {done ? (
          <Done title={done.title} text={done.text} onBack={() => { setOpts(null); go('login'); }} />
        ) : (
          <form onSubmit={requestAdmin} className="space-y-3">
            <p className="text-xs text-slate-600">Your request goes to the Admin, who checks it is you and gives you a new password.</p>
            <div>
              <Label htmlFor="fr-reason">Note for the Admin (optional)</Label>
              <input id="fr-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Forgot password, new phone" className={field} />
            </div>
            {err}
            <button type="submit" disabled={busy} className={primary}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send request to Admin
            </button>
          </form>
        )}
      </div>
    );
  }

  // ---------- step 1: username + password ----------
  return (
    <>
      {setupError && (
        <p className="mb-4 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
          Database not ready: {setupError}. Run all files in supabase/migrations in the Supabase SQL Editor.
        </p>
      )}
      <form onSubmit={signIn} className="space-y-4">
        <div>
          <Label htmlFor="username">Username</Label>
          <input id="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} className={field} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-slate-600" htmlFor="password">
              Password
            </label>
            <button type="button" onClick={() => { setOpts(null); go('forgot'); }} className="text-xs text-orange-600 hover:text-orange-700 font-medium">
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input id="password" type={show ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field + ' pr-10'} />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-2 text-slate-400 hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {err}
        <button type="submit" disabled={busy} className={primary}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Sign in
        </button>
      </form>

      {demo && (
        <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
          <p className="font-semibold mb-2">Demo mode: try either role</p>
          <div className="space-y-2">
            {DEMO.map((d) => (
              <button key={d.email} type="button" onClick={() => signIn(undefined, { username: d.email, password: d.password })} className="w-full text-left rounded-lg bg-white border border-violet-200 hover:border-violet-400 px-3 py-2">
                <div className="font-semibold">{d.label}</div>
                <div className="text-violet-700/80">
                  {d.email} · {d.password}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-sm p-7">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo.png" alt="Phone Buzz" className="w-12 h-12 rounded-2xl bg-slate-800 p-1" />
          <div>
            <h1 className="text-base font-bold text-slate-800">Phone Buzz Dashboard</h1>
            <p className="text-xs text-slate-500">Sign in with your staff account</p>
          </div>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
