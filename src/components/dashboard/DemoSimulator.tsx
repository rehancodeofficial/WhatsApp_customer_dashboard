'use client';

import { useEffect, useState } from 'react';
import { FlaskConical, Send, X } from 'lucide-react';
import type { Conversation } from '@/lib/types';

// DEMO MODE ONLY: lets you play the customer, to see the AI answer (AI on) or stay quiet (paused).
export function DemoSimulator({
  conversations,
  selectedWaId,
  onDone,
}: {
  conversations: Conversation[];
  selectedWaId?: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [waId, setWaId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (selectedWaId) setWaId(selectedWaId);
  }, [selectedWaId]);

  const send = async () => {
    if (!waId || !text.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/demo/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_id: waId, body: text }),
      });
      const data = await res.json();
      setResult(
        data.aiReplied
          ? 'AI is ON for this customer, so the AI replied.'
          : 'AI is PAUSED for this customer, so nobody replied. You must answer.'
      );
      setText('');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-4 py-2.5 shadow-lg flex items-center gap-2"
      >
        <FlaskConical className="w-4 h-4" /> Test as customer
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white border border-violet-200 shadow-xl p-4 text-xs">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-violet-800 flex items-center gap-1.5">
          <FlaskConical className="w-4 h-4" /> Send a test customer message
        </div>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-slate-500 mb-2">This pretends a customer wrote on WhatsApp, the same way n8n reports it. Use a new number to create a new chat.</p>
      <input
        list="demo-numbers"
        value={waId}
        onChange={(e) => setWaId(e.target.value)}
        placeholder="Customer number, e.g. 971551112233"
        className="w-full mb-2 rounded-lg border border-slate-300 px-2.5 py-1.5"
      />
      <datalist id="demo-numbers">
        {conversations.map((c) => (
          <option key={c.id} value={c.contact?.wa_id}>
            {c.contact?.name}
          </option>
        ))}
      </datalist>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Customer message..."
          className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5"
        />
        <button
          onClick={send}
          disabled={busy}
          className="rounded-lg bg-violet-600 text-white px-3 disabled:opacity-50"
          aria-label="Send test message"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
      {result && <p className="mt-2 font-semibold text-slate-700">{result}</p>}
    </div>
  );
}
