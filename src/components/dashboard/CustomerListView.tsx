'use client';

import React, { useState } from 'react';
import { Contact } from '@/lib/types';
import { Search, Mail, Phone, Building, Tag, FileText, ArrowRight } from 'lucide-react';
import { formatTime } from '@/lib/utils';

interface CustomerListViewProps {
  contacts: Contact[];
  onOpenChatWithContact?: (waId: string) => void;
}

export function CustomerListView({ contacts, onOpenChatWithContact }: CustomerListViewProps) {
  const [search, setSearch] = useState('');

  const filtered = contacts.filter((c) => {
    const term = search.toLowerCase();
    const name = c.name?.toLowerCase() || '';
    const phone = c.wa_id || '';
    const email = c.email?.toLowerCase() || '';
    const lead = c.lead_id?.toLowerCase() || '';
    return name.includes(term) || phone.includes(term) || email.includes(term) || lead.includes(term);
  });

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/60 select-none">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">All B2B Customers</h1>
          <p className="text-xs text-slate-500 mt-1">
            Directory of buyers, wholesale dealers, and leads synced with Google Sheets.
          </p>
        </div>

        <div className="w-72 relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer, phone, lead..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white border border-slate-200 outline-none text-slate-900 focus:border-slate-400"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Contact Details</th>
              <th className="py-3 px-4">Lead Status</th>
              <th className="py-3 px-4">Country</th>
              <th className="py-3 px-4">Tags</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((contact) => (
              <tr key={contact.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700">
                      {contact.name?.substring(0, 2) || 'PB'}
                    </div>
                    <div>
                      <div>{contact.name || 'Unnamed Buyer'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{contact.lead_id || 'NO LEAD ID'}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-slate-600">
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <Phone className="w-3 h-3 text-slate-400" /> +{contact.wa_id}
                  </div>
                  {contact.email && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                      <Mail className="w-3 h-3 text-slate-400" /> {contact.email}
                    </div>
                  )}
                </td>
                <td className="py-3.5 px-4">
                  <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-semibold text-[10px]">
                    {contact.lead_status || 'Active Lead'}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-slate-700 font-medium">
                  {contact.country || 'United Arab Emirates'}
                </td>
                <td className="py-3.5 px-4">
                  <div className="flex flex-wrap gap-1">
                    {contact.tags?.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3.5 px-4 text-right">
                  {onOpenChatWithContact && (
                    <button
                      onClick={() => onOpenChatWithContact(contact.wa_id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold inline-flex items-center gap-1"
                    >
                      <span>Open Chat</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
