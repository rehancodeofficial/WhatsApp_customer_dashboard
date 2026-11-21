'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import type { AIModeEvent, Message } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import { AlertCircle, Bot, Check, CheckCheck, Download, FileText, Hand, MessageSquare, User } from 'lucide-react';

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

export function UnifiedMessageList({ messages, events = [], currentMode, party = 'customer' }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

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
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {m.transcript_or_caption && (
                  <p className="mt-1 text-[11px] text-slate-600 border-l-2 border-orange-400 pl-2">
                    <span className="font-semibold">{m.type === 'audio' ? 'Voice note: ' : 'Image: '}</span>
                    {m.transcript_or_caption}
                  </p>
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
