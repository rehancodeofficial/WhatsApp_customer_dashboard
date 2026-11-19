'use client';

import { Settings, CheckCircle2, XCircle } from 'lucide-react';

// Admin-only: shows how the dashboard is connected. Secrets are never sent to the browser.
export function SettingsView({ demo, whatsappLive }: { demo: boolean; whatsappLive: boolean }) {
  const rows = [
    { label: 'Database (Supabase)', ok: !demo, note: demo ? 'Demo mode: sample data in memory, resets on restart' : 'Connected' },
    { label: 'WhatsApp Cloud API (manual replies)', ok: whatsappLive, note: whatsappLive ? 'Token set' : 'WHATSAPP_ACCESS_TOKEN not set, replies cannot be sent' },
  ];
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-500" /> Settings
        </h1>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.label} className="p-4 flex items-start gap-3">
              {r.ok ? <CheckCircle2 className="w-4 h-4 text-orange-600 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-500 mt-0.5" />}
              <div>
                <div className="text-sm font-semibold text-slate-800">{r.label}</div>
                <div className="text-xs text-slate-500">{r.note}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Keys and secrets live in the server environment (.env.local or Vercel → Settings → Environment Variables). See README.md and
          N8N_CHANGES.md.
        </p>
      </div>
    </div>
  );
}
