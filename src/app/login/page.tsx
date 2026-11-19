'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Loader2, Eye, EyeOff } from 'lucide-react';

const DEMO = [
  { label: 'Admin (full access)', email: 'admin@phonebuzz.demo', password: 'Admin@123' },
  { label: 'Management (chats only)', email: 'management@phonebuzz.demo', password: 'Manage@123' },
];

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [name, setName] = useState('');

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
      const next = params.get('next');
      // full navigation so the new session cookie is used everywhere
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
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
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="password">
            Password
          </label>
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
