'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, XCircle } from 'lucide-react';

// Opened from the reset email (owner). The link works once and only for 15 minutes.
function ResetForm() {
  const token = useSearchParams().get('token') || '';
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [reason, setReason] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      setReason('This page needs the link from the reset email.');
      return;
    }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState('ready');
        else {
          setState('invalid');
          setReason(d.reason === 'expired' ? 'This link has expired. Links last 15 minutes.' : 'This link was already used or is not valid.');
        }
      })
      .catch(() => {
        setState('invalid');
        setReason('Could not check the link. Try again.');
      });
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords are not the same.');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: pw }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Could not reset the password.');
      setState('done');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

  if (state === 'checking') return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  if (state === 'invalid')
    return (
      <div className="space-y-4 text-center">
        <XCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <p className="text-sm text-slate-700">{reason}</p>
        <a href="/login" className="inline-block text-sm font-semibold text-orange-600">Back to sign in → Forgot password</a>
      </div>
    );
  if (state === 'done')
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
        <p className="text-sm text-slate-700">Your password was changed. Sign in with the new password.</p>
        <a href="/login" className="inline-block rounded-lg bg-orange-500 text-white text-sm font-semibold px-5 py-2.5">Sign in</a>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-slate-500">Choose a new password for the Admin account. This link works once and expires 15 minutes after it was sent.</p>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="pw">New password</label>
        <div className="relative">
          <input id="pw" type={show ? 'text' : 'password'} autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-2 text-slate-400 hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="pw2">Repeat new password</label>
        <input id="pw2" type={show ? 'text' : 'password'} autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        Set new password
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-sm p-7">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo.png" alt="Phone Buzz" className="w-12 h-12 rounded-2xl bg-slate-800 p-1" />
          <div>
            <h1 className="text-base font-bold text-slate-800">Reset password</h1>
            <p className="text-xs text-slate-500">Phone Buzz Dashboard</p>
          </div>
        </div>
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
