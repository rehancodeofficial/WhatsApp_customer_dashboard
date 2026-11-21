'use client';

import { useEffect, useState } from 'react';

// Preloader shown when the app opens: PB logo, "Welcome to PhoneBuzz" and a loading bar.
// It is part of the first HTML (no blank screen), stays at least MIN_MS so it does not flash,
// then fades out once the page has loaded. Shown once per app session, not on every page change.
const MIN_MS = 1100;
const KEY = 'pb-splash-shown';

export function Splash() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>('show');

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === '1';
      sessionStorage.setItem(KEY, '1');
    } catch {}
    if (seen) {
      setPhase('gone');
      return;
    }
    const start = performance.now();
    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      const wait = Math.max(0, MIN_MS - (performance.now() - start));
      t1 = setTimeout(() => {
        setPhase('fade');
        t2 = setTimeout(() => setPhase('gone'), 450);
      }, wait);
    };
    if (document.readyState === 'complete') done();
    else window.addEventListener('load', done, { once: true });
    // Never block the app: hide after 4 s even if something keeps loading.
    const safety = setTimeout(done, 4000);
    return () => {
      window.removeEventListener('load', done);
      clearTimeout(safety);
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, []);

  if (phase === 'gone') return null;

  return (
    <div
      aria-hidden={phase === 'fade'}
      role="status"
      aria-label="Loading Phone Buzz"
      className={`pb-splash fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#1E293B] transition-opacity duration-[450ms] ${phase === 'fade' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <style>{`
        /* Movement only, never hidden: the logo and text are readable from the first frame, even on slow phones. */
        @keyframes pb-pop { from { transform: scale(.9) } to { transform: scale(1) } }
        @keyframes pb-up { from { transform: translateY(6px) } to { transform: translateY(0) } }
        @keyframes pb-bar { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } }
        .pb-splash .pb-logo { animation: pb-pop .6s cubic-bezier(.2,.8,.2,1) both }
        .pb-splash .pb-text { animation: pb-up .6s .15s ease-out both }
        .pb-splash .pb-bar { animation: pb-bar 1.1s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .pb-splash .pb-logo, .pb-splash .pb-text, .pb-splash .pb-bar { animation: none } }
      `}</style>
      <img src="/logo.png" alt="" width={132} height={132} className="pb-logo w-32 h-32 drop-shadow-[0_8px_24px_rgba(249,115,22,0.25)]" />
      <div className="pb-text mt-6 text-center px-6">
        <p className="text-sm tracking-[0.2em] uppercase text-slate-400">Welcome to</p>
        <h1 className="mt-1 text-3xl font-bold text-white">
          Phone<span className="text-[#F97316]">Buzz</span>
        </h1>
      </div>
      <div className="mt-8 h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="pb-bar h-full w-2/5 rounded-full bg-[#F97316]" />
      </div>
      <p className="absolute text-[11px] text-slate-500" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        Phone Buzz FZCO · Dubai
      </p>
    </div>
  );
}
