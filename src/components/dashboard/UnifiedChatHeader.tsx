'use client';

import React, { useState } from 'react';
import { Conversation, ConversationMode } from '@/lib/types';
import {
  Bot,
  User,
  Clock,
  ChevronDown,
  Play,
  MessageSquare,
  Mail,
  PanelRightClose,
  PanelRightOpen,
  CreditCard,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { get24HourWindowStatus } from '@/lib/whatsapp';

interface UnifiedChatHeaderProps {
  conversation: Conversation;
  onModeChange: (mode: ConversationMode, resumeMinutes?: number) => Promise<void>;
  onTriggerAiNow?: () => Promise<void>;
  onTogglePanel?: () => void;
  isPanelOpen?: boolean;
}

export function UnifiedChatHeader({
  conversation,
  onModeChange,
  onTriggerAiNow,
  onTogglePanel,
  isPanelOpen = true,
}: UnifiedChatHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const contact = conversation.contact;
  const isEmail = conversation.channel === 'email';
  const displayName = contact?.name || (isEmail ? contact?.email : `+${contact?.wa_id}`);

  const windowStatus = get24HourWindowStatus(conversation.last_customer_message_at);

  const handleSwitch = async (newMode: ConversationMode, minutes?: number) => {
    setIsUpdating(true);
    setDropdownOpen(false);
    try {
      await onModeChange(newMode, minutes);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="border-b border-slate-200/80 bg-white px-3 md:px-5 py-3 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Contact info & Channel Tag */}
        <div className="flex items-center space-x-3.5 min-w-0">
          <div className="relative">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-xs ${
                isEmail ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {displayName?.substring(0, 2) || 'PB'}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center text-white text-[8px] ${
                isEmail ? 'bg-blue-600' : 'bg-emerald-600'
              }`}
            >
              {isEmail ? <Mail className="w-2 h-2" /> : <MessageSquare className="w-2 h-2" />}
            </span>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">{displayName}</h2>
              {contact?.country && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                  {contact.country}
                </span>
              )}
              {isEmail ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                  Email Thread
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  WhatsApp Direct
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
              <span>{isEmail ? contact?.email : `+${contact?.wa_id}`}</span>
              <span>·</span>
              <span className="uppercase text-[10px] font-semibold text-slate-400">
                {contact?.preferred_language || 'EN'}
              </span>
              {contact?.lead_status && (
                <>
                  <span>·</span>
                  <span className="text-emerald-600 font-medium">{contact.lead_status}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls & AI Takeover Toggle */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {/* 24-hour Meta Window for WhatsApp */}
          {!isEmail && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                windowStatus.isOpen
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
              title="Meta Cloud API 24-Hour Messaging Window"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{windowStatus.remainingFormatted}</span>
            </div>
          )}

          {/* AI On / Off Takeover Toggle */}
          <div className="relative">
            <div className="inline-flex rounded-lg shadow-xs border border-slate-200 overflow-hidden bg-white">
              <button
                disabled={isUpdating}
                onClick={() => handleSwitch(conversation.mode === 'ai' ? 'human' : 'ai')}
                className={`px-3.5 py-1.5 text-xs font-semibold flex items-center gap-2 transition-all ${
                  conversation.mode === 'ai'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                }`}
              >
                {conversation.mode === 'ai' ? (
                  <>
                    <Bot className="w-4 h-4" />
                    <span>AI Responding</span>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4" />
                    <span>Takeover Active</span>
                  </>
                )}
              </button>

              {/* Dropdown button for timed pauses */}
              <button
                disabled={isUpdating}
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={`px-2 py-1.5 border-l transition-all ${
                  conversation.mode === 'ai'
                    ? 'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border-amber-600 bg-amber-500 text-white hover:bg-amber-600'
                }`}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Timed Pause / Resume Options */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-60 rounded-xl bg-white border border-slate-200 shadow-xl z-50 py-1.5 text-xs">
                <div className="px-3.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  AI Management
                </div>
                <button
                  onClick={() => handleSwitch('ai')}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <Bot className="w-4 h-4 text-emerald-600" />
                  <span>Resume AI Auto-Reply</span>
                </button>
                <button
                  onClick={() => handleSwitch('human')}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <User className="w-4 h-4 text-amber-500" />
                  <span>Pause AI Indefinitely</span>
                </button>
                <button
                  onClick={() => handleSwitch('human', 30)}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>Pause for 30 minutes</span>
                </button>
                <button
                  onClick={() => handleSwitch('human', 120)}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>Pause for 2 hours</span>
                </button>
                <div className="border-t border-slate-100 my-1"></div>
                <button
                  onClick={() => handleSwitch('handoff')}
                  className="w-full text-left px-3.5 py-2 hover:bg-rose-50 flex items-center gap-2 text-rose-600"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>Mark as Sales Handoff</span>
                </button>
              </div>
            )}
          </div>

          {/* Resume & let AI reply now button */}
          {conversation.mode !== 'ai' && onTriggerAiNow && (
            <button
              onClick={onTriggerAiNow}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center gap-1.5 transition-all shadow-xs"
              title="Resume AI and let it generate response to latest message"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume & Reply Now</span>
            </button>
          )}

          {/* Toggle Right Panel Button */}
          {onTogglePanel && (
            <button
              onClick={onTogglePanel}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title={isPanelOpen ? 'Collapse customer panel' : 'Expand customer panel'}
            >
              {isPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Human Takeover Notice Banner */}
      {conversation.mode !== 'ai' && (
        <div className="mt-2.5 px-3.5 py-2 rounded-lg bg-amber-50/90 border border-amber-200/80 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Owner Takeover Active:</strong> AI responses are blocked. Your manual replies are saved to conversation memory so the AI remembers them when resumed.
            </span>
          </div>
          {conversation.resume_at && (
            <span className="text-[11px] font-mono text-amber-700 font-semibold">
              Auto-resumes in {Math.max(0, Math.round((new Date(conversation.resume_at).getTime() - Date.now()) / 60000))}m
            </span>
          )}
        </div>
      )}
    </div>
  );
}
