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

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setDemo(!!d.demo))
      .catch(() => {});
  }, []);

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

  return (
    <>
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
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
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-7">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">Phone Buzz Inbox</h1>
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
