'use client';

import React from 'react';
import { Conversation, AIModeEvent } from '@/lib/types';
import {
  Tag,
  FileText,
  History,
  Building,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { formatFullDateTime } from '@/lib/utils';

interface UnifiedCustomerPanelProps {
  conversation: Conversation;
  modeEvents?: AIModeEvent[];
  onUpdatePaymentStatus?: (status: 'none' | 'pending' | 'verified') => void;
}

export function UnifiedCustomerPanel({
  conversation,
  modeEvents = [],
  onUpdatePaymentStatus,
}: UnifiedCustomerPanelProps) {
  const contact = conversation.contact;
  if (!contact) return null;

  const isEmail = conversation.channel === 'email';
  const displayName = contact.name || (isEmail ? contact.email : `+${contact.wa_id}`);

  return (
    <aside className="w-80 border-l border-slate-200/80 bg-white p-5 overflow-y-auto space-y-6 text-xs shrink-0 select-none">
      {/* Customer Profile Card */}
      <div className="text-center pb-5 border-b border-slate-100">
        <div className="relative inline-block mx-auto mb-2.5">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-lg uppercase shadow-xs ${
              isEmail ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-800'
            }`}
          >
            {displayName?.substring(0, 2) || 'PB'}
          </div>
          <span
            className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-[9px] text-white ${
              contact.is_online ? 'bg-orange-500' : 'bg-slate-300'
            }`}
            title={contact.is_online ? 'Customer is online' : 'Offline'}
          />
        </div>
        <h3 className="font-bold text-sm text-slate-900 tracking-tight">{displayName}</h3>
        {contact.company && (
          <p className="text-slate-500 font-medium text-[11px] mt-0.5">{contact.company}</p>
        )}
        <div className="flex items-center justify-center gap-1.5 mt-2 text-[11px] text-slate-500">
          {contact.wa_id && (
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3 text-slate-400" /> +{contact.wa_id}
            </span>
          )}
          {contact.email && (
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3 text-slate-400" /> {contact.email}
            </span>
          )}
        </div>
      </div>

      {/* CRM & Google Sheet Lead Info */}
      <div className="space-y-3">
        <h4 className="font-bold text-slate-400 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
          <Building className="w-3.5 h-3.5" />
          Lead & Account Details
        </h4>

        <div className="bg-slate-50 rounded-xl p-3.5 space-y-2.5 border border-slate-200/70">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Lead ID:</span>
            <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
              {contact.lead_id || 'LEAD-NEW'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500">Lead Status:</span>
            <span className="font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
              {contact.lead_status || 'Open Inquiry'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500">Country / Region:</span>
            <span className="font-medium text-slate-800">{contact.country || 'United Arab Emirates'}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500">Language:</span>
            <span className="uppercase font-semibold text-slate-800">
              {contact.preferred_language || 'EN'}
            </span>
          </div>
        </div>
      </div>

      {/* Payment Status Management */}
      <div className="space-y-2.5">
        <h4 className="font-bold text-slate-400 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" />
          Order & Payment Status
        </h4>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 font-medium">Status:</span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                conversation.payment_status === 'verified'
                  ? 'bg-orange-100 text-orange-800 border border-orange-200'
                  : conversation.payment_status === 'pending'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {conversation.payment_status === 'verified'
                ? 'Payment Verified'
                : conversation.payment_status === 'pending'
                ? 'Pending Invoice'
                : 'No Active Order'}
            </span>
          </div>

          {onUpdatePaymentStatus && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={() => onUpdatePaymentStatus('pending')}
                className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-semibold text-amber-700"
              >
                Mark Pending
              </button>
              <button
                onClick={() => onUpdatePaymentStatus('verified')}
                className="px-2 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-semibold shadow-xs"
              >
                Verify Payment
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <h4 className="font-bold text-slate-400 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5" />
          Customer Tags
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {contact.tags && contact.tags.length > 0 ? (
            contact.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-medium text-[11px] border border-slate-200"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-slate-400 italic">No tags attached</span>
          )}
        </div>
      </div>

      {/* Internal Staff Notes */}
      <div className="space-y-2">
        <h4 className="font-bold text-slate-400 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Internal Notes
        </h4>
        <div className="p-3 bg-slate-50 rounded-xl text-slate-700 italic border border-slate-200/70 leading-relaxed text-[11px]">
          {contact.notes || 'No customer notes added yet.'}
        </div>
      </div>

      {/* AI Mode Event History */}
      <div className="space-y-2 pt-2 border-t border-slate-100">
        <h4 className="font-bold text-slate-400 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          AI Takeover Audit Log
        </h4>

        <div className="space-y-2">
          {modeEvents.length === 0 ? (
            <div className="text-slate-400 italic text-[11px]">No mode changes recorded.</div>
          ) : (
            modeEvents.slice(0, 5).map((ev) => (
              <div
                key={ev.id}
                className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-tight text-slate-800">
                    {ev.from_mode || 'initial'} ➔ {ev.to_mode}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {formatFullDateTime(ev.created_at)}
                  </span>
                </div>
                {ev.reason && (
                  <p className="text-slate-500 text-[10px] mt-1">{ev.reason}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
