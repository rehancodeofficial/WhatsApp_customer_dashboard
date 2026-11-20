'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff, KeyRound, ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';

const DEMO = [
  { label: 'Admin (full access)', email: 'admin@phonebuzz.demo', password: 'Admin@123' },
  { label: 'Management (chats only)', email: 'management@phonebuzz.demo', password: 'Manage@123' },
];

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<'login' | 'forgot' | 'authreset'>('login');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  // Two-factor step: after a correct password when Microsoft Authenticator is on (or ?mfa=1 from the middleware).
  const [mfa, setMfa] = useState(params.get('mfa') === '1');
  const [code, setCode] = useState('');

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

  const createFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not create the account');
        return;
      }
      setNeedsSetup(false);
      await signIn();
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds || { email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Sign-in failed');
        return;
      }
      if (data.mfa_required) {
        setMfa(true);
        return;
      }
      goNext();
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    const next = params.get('next');
    window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/mfa/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Wrong code');
        if (res.status === 401 && /expired/i.test(data.error || '')) setMfa(false);
        return;
      }
      goNext();
    } finally {
      setBusy(false);
    }
  };

  const cancelMfa = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setMfa(false);
    setCode('');
    setPassword('');
    setError(null);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to submit reset request.');
        return;
      }
      setSuccessMsg(data.message || 'Request submitted successfully.');
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (needsSetup) {
    return (
      <form onSubmit={createFirstAdmin} className="space-y-4">
        <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-900">
          <b>First-time setup.</b> No staff account exists yet. Create the first <b>Admin</b> account. After this, only an
          Admin can add more staff.
        </div>
        <input required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input required type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input required minLength={8} type="password" placeholder="Password (8+ characters)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Create Admin account
        </button>
      </form>
    );
  }

  if (mode === 'forgot') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setSuccessMsg(null);
            }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
          </button>
        </div>

        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="font-semibold text-slate-800 mb-1">Password Assistance</p>
          <ul className="list-disc pl-4 space-y-1 text-slate-500">
            <li><b>Admin:</b> Direct password reset link will be sent to your email.</li>
            <li><b>Staff / Agents:</b> Request will be forwarded to the Admin for identity verification and new password issuance.</li>
          </ul>
        </div>

        <button
          type="button"
          onClick={() => {
            setMode('authreset');
            setError(null);
            setSuccessMsg(null);
          }}
          className="w-full flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 px-3 py-2.5 text-left"
        >
          <ShieldCheck className="w-5 h-5 text-orange-600 shrink-0" />
          <span className="text-xs text-slate-700">
            <b className="block text-slate-800">Have Microsoft Authenticator?</b>
            Reset your password yourself with the 6-digit code, no waiting for the Admin.
          </span>
        </button>

        {successMsg ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Request Submitted
            </div>
            <p>{successMsg}</p>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setSuccessMsg(null);
              }}
              className="mt-2 w-full py-2 bg-emerald-600 text-white rounded-lg font-semibold text-xs hover:bg-emerald-700"
            >
              Return to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="reset-email">
                Registered Email
              </label>
              <input
                id="reset-email"
                type="email"
                required
                placeholder="e.g. name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="reset-reason">
                Reason / Note for Admin (Optional)
              </label>
              <input
                id="reset-reason"
                type="text"
                placeholder="e.g. Forgot password or device changed"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Send Password Reset Request
            </button>
          </form>
        )}
      </div>
    );
  }

  if (mode === 'authreset') {
    const submitAuthReset = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (newPw.length < 8) return setError('New password: at least 8 characters.');
      if (newPw !== newPw2) return setError('The two new passwords are not the same.');
      setBusy(true);
      try {
        const res = await fetch('/api/auth/reset-with-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: resetCode, password: newPw }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setError(data.error || 'Could not reset the password.');
        setSuccessMsg('Password changed. Sign in with your new password.');
        setPassword('');
        setNewPw('');
        setNewPw2('');
        setResetCode('');
      } finally {
        setBusy(false);
      }
    };
    const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setMode('forgot');
            setError(null);
            setSuccessMsg(null);
          }}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        {successMsg ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Password changed
            </div>
            <p>{successMsg}</p>
            <button type="button" onClick={() => { setMode('login'); setSuccessMsg(null); }} className="mt-2 w-full py-2 bg-emerald-600 text-white rounded-lg font-semibold text-xs hover:bg-emerald-700">
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submitAuthReset} className="space-y-3">
            <p className="text-xs text-slate-500">Open Microsoft Authenticator and use the current code for <b>Phone Buzz Dashboard</b>. 3 wrong codes block the account until the Admin unblocks it.</p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="ar-email">Email</label>
              <input id="ar-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="ar-code">Authenticator code</label>
              <input id="ar-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/[^0-9 ]/g, ''))} placeholder="123 456" className={field + ' text-center font-mono tracking-[0.4em] text-base'} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="ar-pw">New password</label>
              <input id="ar-pw" type="password" autoComplete="new-password" required value={newPw} onChange={(e) => setNewPw(e.target.value)} className={field} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="ar-pw2">Repeat new password</label>
              <input id="ar-pw2" type="password" autoComplete="new-password" required value={newPw2} onChange={(e) => setNewPw2(e.target.value)} className={field} />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={busy || resetCode.replace(/\s/g, '').length !== 6} className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Reset password
            </button>
          </form>
        )}
      </div>
    );
  }

  if (mfa) {
    return (
      <form onSubmit={verifyCode} className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-orange-50 border border-orange-200 p-3">
          <ShieldCheck className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-700">
            Two-factor sign-in is on. Open <b>Microsoft Authenticator</b> on your phone and enter the 6-digit code for <b>Phone Buzz Dashboard</b>.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="code">
            Authenticator code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={7}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ''))}
            placeholder="123 456"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg tracking-[0.4em] text-center font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || code.replace(/\s/g, '').length !== 6}
          className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Verify and sign in
        </button>
        <button type="button" onClick={cancelMfa} className="w-full text-xs text-slate-500 hover:text-slate-700">
          Use a different account
        </button>
      </form>
    );
  }

  return (
    <>
      {setupError && (
        <p className="mb-4 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
          Database not ready: {setupError}. Run all files in supabase/migrations in the Supabase SQL Editor.
        </p>
      )}
      <form onSubmit={signIn} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-slate-600" htmlFor="password">
              Password
            </label>
            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setError(null);
                setSuccessMsg(null);
              }}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              type={show ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-700"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Sign in
        </button>
      </form>

      {demo && (
        <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
          <p className="font-semibold mb-2">Demo mode: try either role</p>
          <div className="space-y-2">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => signIn(undefined, d)}
                className="w-full text-left rounded-lg bg-white border border-violet-200 hover:border-violet-400 px-3 py-2"
              >
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
