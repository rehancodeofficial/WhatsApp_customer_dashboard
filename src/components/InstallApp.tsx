'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

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
