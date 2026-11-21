'use client';

import React, { useState } from 'react';
import { Conversation, CommunicationChannel } from '@/lib/types';
import {
  Search,
  MessageSquare,
  Mail,
  Bot,
  User,
  PauseCircle,
  Star,
  Check,
  CheckCheck,
  Filter,
} from 'lucide-react';
import { formatTime } from '@/lib/utils';

interface UnifiedChatListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleStar?: (id: string, currentStarred: boolean) => void;
  initialFilter?: string;
  /** Customers with a confirmed order (Promising); the rest are Exploring. Omit for supplier chats. */
  promisingContactIds?: Set<string>;
}

export function UnifiedChatList({
  conversations,
  selectedId,
  onSelect,
  onToggleStar,
  initialFilter = 'all',
  promisingContactIds,
}: UnifiedChatListProps) {
  const isPromising = (c: Conversation) =>
    !!promisingContactIds?.has(c.contact_id) || /payment verified|order confirmed|confirmed|paid|delivered/i.test(c.contact?.lead_status || '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>(initialFilter);

  const filtered = conversations.filter((c) => {
    // Search query
    const term = search.toLowerCase();
    const name = c.contact?.name?.toLowerCase() || '';
    const phone = c.contact?.wa_id || '';
    const email = c.contact?.email?.toLowerCase() || '';
    const preview = c.last_message_preview?.toLowerCase() || '';
    const subject = c.subject?.toLowerCase() || '';

    if (term && !name.includes(term) && !phone.includes(term) && !email.includes(term) && !preview.includes(term) && !subject.includes(term)) {
      return false;
    }

    // Filter pills
    if (filter === 'unread') return c.unread_count > 0;
    if (filter === 'whatsapp') return c.channel === 'whatsapp';
    if (filter === 'email') return c.channel === 'email';
    if (filter === 'ai') return c.mode === 'ai';
    if (filter === 'human') return c.mode === 'human' || c.mode === 'handoff';
    if (filter === 'starred') return !!c.is_starred;
    if (filter === 'archived') return !!c.is_archived;
    if (filter === 'exploring') return !isPromising(c);
    if (filter === 'promising') return isPromising(c);

    return true;
  });

  return (
    <div className="w-80 md:w-96 flex flex-col h-full border-r border-slate-200/80 bg-white select-none shrink-0">
      {/* Search Header */}
      <div className="p-3.5 border-b border-slate-100 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer, number, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200/80 focus:bg-white focus:border-slate-400 outline-none text-slate-800 placeholder-slate-400 transition-all"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread' },
            ...(promisingContactIds
              ? [
                  { id: 'promising', label: 'Promising' },
                  { id: 'exploring', label: 'Exploring' },
                ]
              : []),
            { id: 'ai', label: 'AI', icon: Bot },
            { id: 'human', label: 'Manual', icon: User },
            { id: 'starred', label: 'Starred', icon: Star },
          ].map((item: { id: string; label: string; icon?: React.ElementType }) => {
            const Icon = item.icon;
            const isSelected = filter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={`px-2.5 py-1 rounded-full font-medium transition-all flex items-center space-x-1 whitespace-nowrap ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                {Icon && <Icon className="w-3 h-3 mr-0.5" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No conversations match your filter.
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            const contact = conv.contact;
            const name = contact?.name || (conv.channel === 'email' ? contact?.email : `+${contact?.wa_id}`);
            const isEmail = conv.channel === 'email';

            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`p-3.5 flex items-start space-x-3 cursor-pointer transition-all relative ${
                  isSelected
                    ? 'bg-orange-50/60 border-l-4 border-orange-600'
                    : 'hover:bg-slate-50/80'
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-xs ${
                      isEmail
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : 'bg-orange-100 text-orange-800 border border-orange-200'
                    }`}
                  >
                    {name?.substring(0, 2) || 'PB'}
                  </div>

                  {/* Channel badge overlay */}
                  <div
                    className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] shadow-xs ${
                      isEmail ? 'bg-blue-600' : 'bg-orange-600'
                    }`}
                    title={isEmail ? 'Email Thread' : 'WhatsApp Chat'}
                  >
                    {isEmail ? <Mail className="w-2.5 h-2.5" /> : <MessageSquare className="w-2.5 h-2.5" />}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {name}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>

                  {/* Subject if email */}
                  {isEmail && conv.subject && (
                    <div className="text-[11px] font-medium text-slate-700 truncate mb-0.5">
                      {conv.subject}
                    </div>
                  )}

                  {/* Message Preview */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <p className="truncate pr-2">
                      {conv.last_message_preview || 'No messages'}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-orange-600 text-white font-bold text-[10px] shrink-0">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>

                  {/* Status Badges */}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      {/* Mode Badge */}
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md font-semibold tracking-wide uppercase ${
                          conv.mode === 'ai'
                            ? 'bg-orange-50 text-orange-700 border border-orange-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {conv.mode === 'ai' && <Bot className="w-2.5 h-2.5" />}
                        {conv.mode !== 'ai' && <User className="w-2.5 h-2.5" />}
                        {conv.mode === 'ai' ? 'AI' : 'Manual'}
                      </span>

                      {/* Payment Badge */}
                      {conv.payment_status === 'verified' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200 font-semibold">
                          Paid
                        </span>
                      )}
                      {conv.payment_status === 'pending' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                          Payment Due
                        </span>
                      )}

                      {contact?.lead_id && (
                        <span className="text-[9px] text-slate-400 font-mono">
                          {contact.lead_id}
                        </span>
                      )}
                    </div>

                    {/* Star Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar && onToggleStar(conv.id, !!conv.is_starred);
                      }}
                      className="p-1 text-slate-300 hover:text-amber-400 transition-colors"
                      title={conv.is_starred ? 'Starred' : 'Star conversation'}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          conv.is_starred ? 'fill-amber-400 text-amber-400' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
