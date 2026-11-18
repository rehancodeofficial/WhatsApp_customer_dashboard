'use client';

import React, { useRef, useEffect } from 'react';
import { Message } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import {
  Check,
  CheckCheck,
  AlertCircle,
  Bot,
  UserCheck,
  FileText,
  Download,
  Mail,
  Sparkles,
} from 'lucide-react';

interface UnifiedMessageListProps {
  messages: Message[];
  channel?: 'whatsapp' | 'email';
}

export function UnifiedMessageList({ messages, channel = 'whatsapp' }: UnifiedMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const renderStatus = (msg: Message) => {
    if (msg.direction !== 'outbound') return null;

    if (msg.status === 'failed') {
      return (
        <span className="text-rose-500 flex items-center gap-0.5" title={msg.error_message || 'Delivery failed'}>
          <AlertCircle className="w-3.5 h-3.5" />
        </span>
      );
    }
    if (msg.status === 'read') {
      return (
        <span title="Read by recipient">
          <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
        </span>
      );
    }
    if (msg.status === 'delivered') {
      return (
        <span title="Delivered">
          <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
        </span>
      );
    }
    return (
      <span title="Sent">
        <Check className="w-3.5 h-3.5 text-slate-400" />
      </span>
    );
  };

  return (
    <div
      className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/70"
      style={{
        backgroundImage: `radial-gradient(circle, rgba(148, 163, 184, 0.12) 1px, transparent 1px)`,
        backgroundSize: '20px 20px',
      }}
    >
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 text-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-300">
            <Mail className="w-6 h-6" />
          </div>
          <p className="font-medium text-slate-600">No message history yet</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Incoming and outgoing messages for this conversation will appear here.
          </p>
        </div>
      ) : (
        messages.map((msg, index) => {
          const isInbound = msg.direction === 'inbound';
          const isAI = msg.sender_type === 'ai';
          const isAgent = msg.sender_type === 'agent';

          const showDateHeader =
            index === 0 ||
            new Date(msg.created_at).toDateString() !==
              new Date(messages[index - 1].created_at).toDateString();

          return (
            <React.Fragment key={msg.id || index}>
              {/* Date divider */}
              {showDateHeader && (
                <div className="flex justify-center my-3">
                  <span className="px-3 py-1 rounded-full bg-white text-[10px] font-semibold text-slate-500 shadow-xs border border-slate-200/80">
                    {new Date(msg.created_at).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}

              {/* Message row */}
              <div
                className={`flex flex-col ${
                  isInbound ? 'items-start' : 'items-end'
                }`}
              >
                {/* Sender Tag Header */}
                {!isInbound && (
                  <div className="flex items-center gap-1.5 mb-1 px-1.5 text-[10px] font-semibold">
                    {isAI ? (
                      <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <Sparkles className="w-3 h-3 text-emerald-600" /> AI Sales Agent
                      </span>
                    ) : isAgent ? (
                      <span className="flex items-center gap-1 text-slate-800 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-xs">
                        <UserCheck className="w-3 h-3 text-amber-500" /> PhoneBuzz Staff
                      </span>
                    ) : (
                      <span className="text-slate-400">System</span>
                    )}
                  </div>
                )}

                {/* Bubble Container */}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-xs text-xs relative transition-all ${
                    isInbound
                      ? 'bg-white text-slate-800 rounded-tl-xs border border-slate-200/80'
                      : isAI
                      ? 'bg-emerald-50/90 text-slate-900 rounded-tr-xs border border-emerald-200'
                      : 'bg-white text-slate-900 rounded-tr-xs border border-slate-200 shadow-xs'
                  }`}
                >
                  {/* Email Subject line if present */}
                  {msg.subject && (
                    <div className="mb-1.5 pb-1.5 border-b border-slate-200/60 font-semibold text-[11px] text-slate-800">
                      Subject: {msg.subject}
                    </div>
                  )}

                  {/* Media Content */}
                  {msg.type === 'image' && msg.media_url && (
                    <div className="mb-2 rounded-xl overflow-hidden border border-slate-200">
                      <img
                        src={msg.media_url}
                        alt="Attached media"
                        className="max-h-64 w-auto object-cover"
                      />
                    </div>
                  )}

                  {msg.type === 'audio' && msg.media_url && (
                    <div className="mb-2 p-1 bg-slate-50 rounded-lg border border-slate-200">
                      <audio controls src={msg.media_url} className="h-8 w-full max-w-xs" />
                    </div>
                  )}

                  {/* Body Text */}
                  {msg.body && (
                    <p className="whitespace-pre-wrap leading-relaxed break-words font-normal">
                      {msg.body}
                    </p>
                  )}

                  {/* Gemini Transcription or Caption */}
                  {msg.transcript_or_caption && (
                    <div className="mt-2 p-2 rounded-lg bg-emerald-50/60 border-l-2 border-emerald-500 text-[11px] text-slate-700">
                      <span className="font-semibold text-emerald-700 block text-[10px] mb-0.5">
                        Gemini AI Transcription:
                      </span>
                      {msg.transcript_or_caption}
                    </div>
                  )}

                  {/* Attachments if any */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.attachments.map((att, attIdx) => (
                        <a
                          key={attIdx}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] transition-colors"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <FileText className="w-3.5 h-3.5 text-slate-500" />
                            <span className="truncate">{att.name}</span>
                          </div>
                          <Download className="w-3 h-3 text-slate-400 shrink-0 ml-2" />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Error display if Meta delivery failed */}
                  {msg.status === 'failed' && msg.error_message && (
                    <div className="mt-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-700 font-medium">
                      {msg.error_message}
                    </div>
                  )}

                  {/* Bubble Footer */}
                  <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-slate-400 select-none">
                    <span>{formatTime(msg.created_at)}</span>
                    {renderStatus(msg)}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
