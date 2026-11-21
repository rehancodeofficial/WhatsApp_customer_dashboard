'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AIModeEvent, Message } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import { AlertCircle, Bot, Check, CheckCheck, Download, FileText, Hand, Languages, Loader2, MessageSquare, User } from 'lucide-react';

// View-only WhatsApp-style chat. Shows customer/supplier messages, AI replies, and owner/staff replies.
// When the AI was paused (manual period), owner/staff messages and customer replies are all displayed
// chronologically, along with an indicator for the manual handling period.

interface Props {
  messages: Message[];
  events?: AIModeEvent[];
  /** Current mode of the chat: when it is not 'ai', the manual period is still open. */
  currentMode?: 'ai' | 'human' | 'handoff';
  party?: 'customer' | 'supplier';
  channel?: 'whatsapp' | 'email';
  /** Enables the "Translate to English" button (viewer only, nothing is sent). */
  conversationId?: string;
}

type En = Record<string, { body?: string; transcript?: string }>;
const EN_KEY = 'pb-chat-english';

/** English text of the chat, only for the person looking at the dashboard. Saved per browser. */
function useEnglish(conversationId: string | undefined, messages: Message[]) {
  const [on, setOn] = useState(false);
  const [fetched, setFetched] = useState<En>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      setOn(localStorage.getItem(EN_KEY) === '1');
    } catch {}
  }, []);
  const toggle = () => {
    setOn((v) => {
      try {
        localStorage.setItem(EN_KEY, v ? '0' : '1');
      } catch {}
      return !v;
    });
    setError(null);
  };
  // Translations already saved on the messages, plus the ones fetched now.
  const en = useMemo<En>(() => {
    const m: En = {};
    for (const x of messages) {
      const r = (x.raw || {}) as Record<string, unknown>;
      if (typeof r.en === 'string' || typeof r.en_t === 'string') m[x.id] = { body: r.en as string | undefined, transcript: r.en_t as string | undefined };
    }
    return { ...m, ...fetched };
  }, [messages, fetched]);
  useEffect(() => {
    if (!on || !conversationId) return;
    const missing = messages
      .filter((x) => !en[x.id] && ((x.body && x.body.trim()) || (x.transcript_or_caption && x.transcript_or_caption.trim())))
      .slice(-40)
      .map((x) => x.id);
    if (!missing.length) return;
    let live = true;
    setBusy(true);
    fetch(`/api/conversations/${conversationId}/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: missing }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Translation failed');
        if (live) setFetched((f) => ({ ...f, ...(d.translations || {}) }));
        if (live && d.failed) setError(`${d.failed} message(s) could not be translated`);
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, conversationId, messages.length]);
  return { on, toggle, en, busy, error };
}

type Item =
  | { kind: 'msg'; m: Message }
  | { kind: 'manual'; from: string; to: string | null }
  | { kind: 'day'; label: string };

function manualWindows(events: AIModeEvent[], currentMode?: string) {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const out: { from: string; to: string | null }[] = [];
  let open: string | null = null;
  for (const e of sorted) {
    if (e.to_mode !== 'ai' && open === null) open = e.created_at;
    else if (e.to_mode === 'ai' && open !== null) {
      out.push({ from: open, to: e.created_at });
      open = null;
    }
  }
  if (open !== null) out.push({ from: open, to: null });
  // Chat is paused but the pause event is older than what we loaded.
  if (!out.some((w) => w.to === null) && currentMode && currentMode !== 'ai') out.push({ from: sorted.at(-1)?.created_at || new Date(0).toISOString(), to: null });
  return out;
}

export function UnifiedMessageList({ messages, events = [], currentMode, party = 'customer', conversationId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const english = useEnglish(conversationId, messages);

  const items = useMemo<Item[]>(() => {
    const windows = manualWindows(events, currentMode);
    // Show all customer/supplier messages and outbound messages (AI or owner/agent)
    const visible = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const list: Item[] = [];
    const shownWindows = new Set<string>();
    let lastDay = '';
    const pushDay = (iso: string) => {
      const d = new Date(iso).toDateString();
      if (d !== lastDay) {
        lastDay = d;
        list.push({ kind: 'day', label: new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) });
      }
    };

    // Insert manual window markers and messages in chronological order
    const markers = windows.map((w) => ({ kind: 'manual' as const, from: w.from, to: w.to }));
    let markerIdx = 0;

    for (const m of visible) {
      // While there are markers that happened before or at this message's timestamp
      while (markerIdx < markers.length && markers[markerIdx].from <= m.created_at) {
        const marker = markers[markerIdx];
        if (!shownWindows.has(marker.from)) {
          pushDay(marker.from);
          list.push(marker);
          shownWindows.add(marker.from);
        }
        markerIdx++;
      }
      pushDay(m.created_at);
      list.push({ kind: 'msg', m });
    }

    // Remaining markers after all messages
    while (markerIdx < markers.length) {
      const marker = markers[markerIdx];
      if (!shownWindows.has(marker.from)) {
        pushDay(marker.from);
        list.push(marker);
        shownWindows.add(marker.from);
      }
      markerIdx++;
    }

    return list;
  }, [messages, events, currentMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length]);

  const status = (m: Message) => {
    if (m.direction !== 'outbound') return null;
    if (m.status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-rose-500" aria-label={m.error_message || 'Failed'} />;
    if (m.status === 'read') return <CheckCheck className="w-3.5 h-3.5 text-sky-500" aria-label="Read" />;
    if (m.status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-slate-400" aria-label="Delivered" />;
    return <Check className="w-3.5 h-3.5 text-slate-400" aria-label="Sent" />;
  };
  const who = party === 'supplier' ? 'Supplier' : 'Customer';

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2 bg-[#f5efe6]" style={{ backgroundImage: 'radial-gradient(circle, rgba(30,41,59,0.05) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
      {conversationId && items.length > 0 && (
        <div className="sticky top-0 z-10 flex justify-end -mt-1 mb-1">
          <button
            onClick={english.toggle}
            aria-pressed={english.on}
            title="Show this chat in English for you only. Messages to the customer still go in their language."
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm border transition-colors ${
              english.on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {english.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
            {english.on ? 'Show original' : 'Translate to English'}
          </button>
        </div>
      )}
      {english.on && english.error && <div className="text-center text-[11px] text-rose-600">{english.error}</div>}
      {items.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs">
          <MessageSquare className="w-6 h-6 mb-2 text-slate-400" />
          <p className="font-medium text-slate-600">No messages yet</p>
        </div>
      ) : (
        items.map((it, i) => {
          if (it.kind === 'day') {
            return (
              <div key={`d${i}`} className="flex justify-center py-2">
                <span className="px-3 py-1 rounded-lg bg-white/90 text-[11px] text-slate-600 shadow-sm">{it.label}</span>
              </div>
            );
          }
          if (it.kind === 'manual') {
            return (
              <div key={`w${it.from}`} className="flex justify-center py-1.5">
                <div className="max-w-[90%] rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900 text-center">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Hand className="w-3.5 h-3.5" /> Manual
                  </span>{' '}
                  · AI paused at {formatTime(it.from)}, owner handled this chat on WhatsApp
                  {it.to ? ` until ${formatTime(it.to)}` : ''}.
                  {it.to && <span className="block mt-0.5 font-semibold text-orange-700">AI is back from here</span>}
                </div>
              </div>
            );
          }
          const m = it.m;
          const inbound = m.direction === 'inbound';
          const isOwner = !inbound && m.sender_type !== 'ai';
          return (
            <div key={m.id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm ${
                  inbound
                    ? 'bg-white text-slate-800 rounded-tl-sm'
                    : isOwner
                    ? 'bg-amber-100 text-slate-900 rounded-tr-sm border border-amber-200/60'
                    : 'bg-orange-100 text-slate-900 rounded-tr-sm'
                }`}
              >
                <div
                  className={`flex items-center gap-1 text-[10px] font-semibold mb-0.5 ${
                    inbound ? 'text-slate-500' : isOwner ? 'text-amber-800' : 'text-orange-700'
                  }`}
                >
                  {inbound ? (
                    who
                  ) : isOwner ? (
                    <>
                      <User className="w-3 h-3" /> Owner
                    </>
                  ) : (
                    <>
                      <Bot className="w-3 h-3" /> AI
                    </>
                  )}
                </div>
                {m.type === 'image' && m.media_url && <img src={m.media_url} alt="" className="mb-1.5 rounded-lg max-h-64 w-auto" />}
                {m.type === 'audio' && m.media_url && <audio controls src={m.media_url} className="mb-1.5 h-8 w-56 max-w-full" />}
                {m.body && (
                  <p className="whitespace-pre-wrap break-words" title={english.on && english.en[m.id]?.body ? m.body : undefined}>
                    {english.on && english.en[m.id]?.body ? english.en[m.id]!.body : m.body}
                  </p>
                )}
                {m.transcript_or_caption && (
                  <p className="mt-1 text-[11px] text-slate-600 border-l-2 border-orange-400 pl-2">
                    <span className="font-semibold">{m.type === 'audio' ? 'Voice note: ' : 'Image: '}</span>
                    {english.on && english.en[m.id]?.transcript ? english.en[m.id]!.transcript : m.transcript_or_caption}
                  </p>
                )}
                {english.on && (english.en[m.id]?.body || english.en[m.id]?.transcript) && (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                    <Languages className="w-2.5 h-2.5" /> English
                  </span>
                )}
                {m.attachments?.map((a, ai) => (
                  <a key={ai} href={a.url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-2 text-[11px] text-slate-700 underline">
                    <FileText className="w-3.5 h-3.5" /> {a.name} <Download className="w-3 h-3" />
                  </a>
                ))}
                <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-slate-500">
                  <span>{formatTime(m.created_at)}</span>
                  {status(m)}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
