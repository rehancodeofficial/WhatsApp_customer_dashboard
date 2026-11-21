'use client';

import React, { useState } from 'react';
import { Send, FileText, AlertTriangle, Languages, Loader2 } from 'lucide-react';
import { get24HourWindowStatus } from '@/lib/whatsapp';

interface UnifiedMessageComposerProps {
  conversationId: string;
  channel?: 'whatsapp' | 'email';
  lastCustomerMessageAt: string | null;
  /** Customer's language: the owner's text is translated into it before sending. */
  language?: string | null;
  onSendMessage: (payload: {
    type: 'text' | 'template';
    body?: string;
    templateName?: string;
    subject?: string;
    translate?: boolean;
  }) => Promise<void>;
}

// Templates approved in the Phone Buzz WhatsApp account (no variables).
const APPROVED_TEMPLATES = [
  {
    name: 'phonebuzz_intro',
    label: 'Phone Buzz introduction',
    description: 'Hello! This is the Phone Buzz FZCO sales assistant… please reply with the model, quantity, storage, grade, color and delivery country you need.',
  },
];

export function UnifiedMessageComposer({
  conversationId,
  channel = 'whatsapp',
  lastCustomerMessageAt,
  language,
  onSendMessage,
}: UnifiedMessageComposerProps) {
  const [text, setText] = useState('');
  const lang = String(language || '').replace(/\s*\(auto\)\s*/gi, '').trim() || 'English';
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const isEmail = channel === 'email';
  const windowStatus = get24HourWindowStatus(lastCustomerMessageAt);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || isSending) return;

    if (!isEmail && !windowStatus.isOpen) {
      setShowTemplatePicker(true);
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      await onSendMessage({
        type: 'text',
        body: text.trim(),
        subject: isEmail ? subject.trim() || 'Re: PhoneBuzz Inquiry' : undefined,
        translate: true,
      });
      setText('');
      setSubject('');
    } catch (e: any) {
      setError(e?.message || 'Could not send the message');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendTemplate = async (templateName: string) => {
    setIsSending(true);
    setShowTemplatePicker(false);
    setError(null);
    try {
      await onSendMessage({
        type: 'template',
        templateName,
      });
    } catch (e: any) {
      setError(e?.message || 'Could not send the template');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="border-t border-slate-200/80 bg-white p-4 shrink-0">
      {/* 24-Hour Warning Banner for WhatsApp */}
      {!isEmail && !windowStatus.isOpen && (
        <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>24h Window Closed:</strong> Free text messages are blocked by Meta (Error 131047). Send an approved WhatsApp template to re-open customer conversation.
            </span>
          </div>
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 shrink-0 shadow-xs"
          >
            Select Template
          </button>
        </div>
      )}

      {/* Template Picker Modal */}
      {showTemplatePicker && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-600" />
                Select Approved WhatsApp Template
              </h3>
              <button
                onClick={() => setShowTemplatePicker(false)}
                className="text-slate-400 hover:text-slate-600 text-xs p-1"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Sending an approved template re-opens the Meta 24-hour messaging window as soon as the customer responds.
            </p>

            <div className="space-y-2.5">
              {APPROVED_TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.name}
                  onClick={() => handleSendTemplate(tmpl.name)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-orange-500 hover:bg-orange-50/40 cursor-pointer transition-all"
                >
                  <div className="font-semibold text-xs text-slate-900 mb-1">
                    {tmpl.label}
                  </div>
                  <div className="text-[11px] text-slate-500 italic">
                    "{tmpl.description}"
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Email Subject line if Email Channel */}
      {isEmail && (
        <div className="mb-2">
          <input
            type="text"
            placeholder="Subject line..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-400 outline-none text-slate-900"
          />
        </div>
      )}

      {error && <div className="mb-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{error}</div>}

      {/* Translation: the owner writes in his language, the customer reads theirs. */}
      {!isEmail && (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-600 select-none w-fit">
          <Languages className="w-3.5 h-3.5 text-orange-600" />
          <span>Always sent in <b className="text-slate-800">{lang}</b> (their language)</span>
        </div>
      )}

      {/* Composer Input Area */}
      <form onSubmit={handleSend} className="flex items-end space-x-2">
        {!isEmail && (
          <button
            type="button"
            onClick={() => setShowTemplatePicker(true)}
            title="Send WhatsApp Template"
            className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <FileText className="w-4 h-4" />
          </button>
        )}

        <div className="flex-1 bg-slate-50 border border-slate-200/90 rounded-2xl px-3.5 py-2 flex items-center focus-within:bg-white focus-within:border-slate-400 transition-all">
          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              isEmail
                ? 'Compose reply email to customer (Shift+Enter for newline, Enter to send)...'
                : windowStatus.isOpen
                ? `Write in any language, it goes out in ${lang} (Enter to send)…`
                : '24h window closed — click Template icon to re-engage customer'
            }
            className="w-full bg-transparent border-none outline-none resize-none text-xs text-slate-900 placeholder-slate-400 max-h-32"
          />
        </div>

        <button
          type="submit"
          disabled={!text.trim() || isSending}
          className={`p-3 rounded-xl text-white disabled:opacity-40 transition-all shadow-xs ${
            isEmail ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'
          }`}
          title="Send message"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
