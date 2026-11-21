'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X, Smartphone, MoreVertical } from 'lucide-react';

// "Install the app" banner. Android/Chrome: one-tap install. iPhone/Safari: shows how to add it to the
// Home Screen (iOS has no install button for web apps). Hidden when already running as the app.
const KEY = 'pb-install-dismissed';
const SNOOZE_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function snoozed() {
  try {
    const t = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - t < SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

// The browser's install prompt arrives once; keep it globally so the sidebar "Install app" button can use it too.
let savedPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    savedPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event('pb-install-ready'));
  });
  window.addEventListener('appinstalled', () => {
    savedPrompt = null;
    window.dispatchEvent(new Event('pb-install-ready'));
  });
}

const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);
const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
};

/** Sidebar button under Settings: installs the app (Android/Chrome/Edge) or shows how (iPhone, other browsers). */
export function InstallAppButton({ collapsed = false, className = '' }: { collapsed?: boolean; className?: string }) {
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const update = () => setInstalled(isStandalone());
    update();
    window.addEventListener('pb-install-ready', update);
    return () => window.removeEventListener('pb-install-ready', update);
  }, []);
  if (installed) return null;

  const install = async () => {
    const p = savedPrompt;
    if (!p) return setHelp(true);
    await p.prompt();
    const { outcome } = await p.userChoice;
    savedPrompt = null;
    if (outcome === 'accepted') setInstalled(true);
  };

  return (
    <>
      <button
        onClick={install}
        title={collapsed ? 'Install app' : undefined}
        className={`w-full flex items-center gap-3 rounded-xl text-sm text-slate-600 hover:bg-orange-50 hover:text-orange-700 ${collapsed ? 'justify-center h-11' : 'px-3 h-10'} ${className}`}
      >
        <Download className="w-[18px] h-[18px] shrink-0" />
        {!collapsed && <span className="flex-1 text-left truncate">Install app</span>}
      </button>
      {help && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && setHelp(false)}>
          <div role="dialog" aria-modal="true" aria-label="Install the Phone Buzz app" className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Install Phone Buzz</h3>
                <p className="text-xs text-slate-500">Open it from your home screen like an app.</p>
              </div>
            </div>
            {isIosDevice() ? (
              <ol className="text-xs text-slate-700 space-y-1.5 list-decimal pl-4">
                <li>Open this page in <b>Safari</b>.</li>
                <li>
                  Tap <Share className="inline w-3.5 h-3.5 -mt-0.5" /> <b>Share</b> at the bottom.
                </li>
                <li>
                  Tap <b>Add to Home Screen</b>, then <b>Add</b>.
                </li>
              </ol>
            ) : (
              <ol className="text-xs text-slate-700 space-y-1.5 list-decimal pl-4">
                <li>
                  Open the browser menu <MoreVertical className="inline w-3.5 h-3.5 -mt-0.5" /> (Chrome or Edge).
                </li>
                <li>
                  Tap <b>Install app</b> or <b>Add to Home screen</b>.
                </li>
                <li>
                  Confirm with <b>Install</b>. The <Smartphone className="inline w-3.5 h-3.5 -mt-0.5" /> Phone Buzz icon appears on your home screen.
                </li>
              </ol>
            )}
            <div className="flex justify-end">
              <button onClick={() => setHelp(false)} className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-900">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    if (standalone || snoozed()) return;

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    if (isIos && isSafari) {
      setIos(true);
      setShow(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    if (savedPrompt) {
      setPrompt(savedPrompt);
      setShow(true);
    }
    const onInstalled = () => setShow(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    if (outcome === 'accepted') setShow(false);
  };

  if (!show || (!prompt && !ios)) return null;

  return (
    <div
      role="dialog"
      aria-label="Install the Phone Buzz app"
      className="fixed inset-x-0 bottom-0 z-[60] px-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div className="mx-auto max-w-md flex items-center gap-3 rounded-2xl bg-slate-800 text-white shadow-xl p-3">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1 text-xs leading-snug">
          <div className="text-sm font-semibold">Install Phone Buzz</div>
          {ios ? (
            <span className="text-slate-300">
              Tap <Share className="inline w-3.5 h-3.5 -mt-0.5" /> Share, then <b className="text-white">Add to Home Screen</b>.
            </span>
          ) : (
            <span className="text-slate-300">Open it from your home screen like an app.</span>
          )}
        </div>
        {!ios && (
          <button onClick={install} className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3 py-2 text-xs font-semibold">
            <Download className="w-3.5 h-3.5" /> Install
          </button>
        )}
        <button onClick={close} aria-label="Not now" className="shrink-0 p-1.5 text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
