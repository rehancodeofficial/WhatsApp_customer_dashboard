'use client';

import React from 'react';
import {
  Users,
  MessageSquare,
  Mail,
  Bot,
  UserCheck,
  TrendingUp,
  CreditCard,
  BellRing,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { DashboardStats, Conversation } from '@/lib/types';
import { formatTime } from '@/lib/utils';

interface DashboardOverviewProps {
  stats: DashboardStats;
  recentConversations: Conversation[];
  onOpenChat: (id: string) => void;
}

export function DashboardOverview({ stats, recentConversations, onOpenChat }: DashboardOverviewProps) {
  const kpiCards = [
    {
      label: 'Total Customers',
      value: stats.totalCustomers,
      sub: 'Wholesale B2B contacts',
      icon: Users,
      color: 'text-slate-900',
      bg: 'bg-slate-100',
    },
    {
      label: 'Active Conversations',
      value: stats.activeChats,
      sub: `${stats.unreadMessages} unread messages`,
      icon: MessageSquare,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: 'AI Sales Handled',
      value: stats.aiHandledConversations,
      sub: 'Automated pricing quotes',
      icon: Bot,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: 'Human Takeover',
      value: stats.humanHandledConversations,
      sub: 'Staff answering directly',
      icon: UserCheck,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'WhatsApp Threads',
      value: stats.whatsappConversations,
      sub: 'Meta Cloud API direct',
      icon: MessageSquare,
      color: 'text-orange-700',
      bg: 'bg-orange-100/60',
    },
    {
      label: 'Email Inquiries',
      value: stats.emailConversations,
      sub: 'B2B RFQ & proforma emails',
      icon: Mail,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Pending Invoices',
      value: stats.pendingPaymentCount,
      sub: 'Awaiting customer transfer',
      icon: CreditCard,
      color: 'text-amber-700',
      bg: 'bg-amber-100/60',
    },
    {
      label: 'Verified Orders',
      value: stats.verifiedPaymentCount,
      sub: 'Payment confirmed in full',
      icon: CheckCircle2,
      color: 'text-orange-800',
      bg: 'bg-orange-100',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/60 select-none">
      {/* Overview Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Executive Dashboard Overview</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time multi-channel B2B communication & automated AI performance at Phone Buzz FZCO.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
            <span className="font-semibold text-slate-800">Dubai HQ (GST)</span>
          </div>
        </div>
      </div>

      {/* 8 Metric KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500">{card.label}</span>
                <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 tracking-tight">{card.value}</div>
              <div className="text-[11px] text-slate-400 mt-1 font-medium">{card.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Activity Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Active Conversations */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Customer Inquiries</h2>
              <p className="text-xs text-slate-400">Latest active chats across WhatsApp & Email</p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {recentConversations.slice(0, 6).map((c) => {
              const contact = c.contact;
              const name = contact?.name || (c.channel === 'email' ? contact?.email : `+${contact?.wa_id}`);
              const isEmail = c.channel === 'email';

              return (
                <div
                  key={c.id}
                  onClick={() => onOpenChat(c.id)}
                  className="py-3 flex items-center justify-between hover:bg-slate-50/80 px-2 rounded-xl cursor-pointer transition-all"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                        isEmail ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {name?.substring(0, 2) || 'PB'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 truncate">{name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                            c.mode === 'ai'
                              ? 'bg-orange-50 text-orange-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {c.mode}
                        </span>
                        {isEmail ? (
                          <span className="text-[9px] text-blue-600 font-semibold bg-blue-50 px-1 rounded">
                            Email
                          </span>
                        ) : (
                          <span className="text-[9px] text-orange-600 font-semibold bg-orange-50 px-1 rounded">
                            WhatsApp
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {c.last_message_preview || 'No preview'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-4">
                    <span className="text-[11px] font-medium text-slate-400">
                      {formatTime(c.last_message_at)}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 ml-auto mt-0.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System & AI Performance */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">AI Sales Agent Health</h2>
            <p className="text-xs text-slate-400">n8n Workflow + Gemini 1.5 Pro</p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-600">Model Engine:</span>
                <span className="text-slate-900">Gemini 1.5 Flash / Pro</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-slate-600">Memory Provider:</span>
                <span className="text-orange-700">PostgreSQL Chat Memory</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-slate-600">Wholesale Price List:</span>
                <span className="text-slate-900">Live Dubai Inventory</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>AI Resolution Rate</span>
                <span>86%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-orange-600 h-full w-[86%] rounded-full"></div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Meta 24h Compliance</span>
                <span>100%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-orange-600 h-full w-full rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
