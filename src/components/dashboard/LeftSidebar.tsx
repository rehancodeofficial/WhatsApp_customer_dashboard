'use client';

import React from 'react';
import {
  LayoutDashboard,
  Inbox,
  MessageSquare,
  Mail,
  Users,
  Archive,
  Star,
  Bot,
  UserCheck,
  BarChart3,
  Settings,
  Sparkles,
} from 'lucide-react';

export type NavItem =
  | 'overview'
  | 'unified-inbox'
  | 'whatsapp'
  | 'email'
  | 'customers'
  | 'starred'
  | 'archived'
  | 'ai-activity'
  | 'handoff'
  | 'analytics'
  | 'settings';

interface LeftSidebarProps {
  currentTab: NavItem;
  onTabChange: (tab: NavItem) => void;
  unreadCount?: number;
  waitingHumanCount?: number;
}

export function LeftSidebar({
  currentTab,
  onTabChange,
  unreadCount = 0,
  waitingHumanCount = 0,
}: LeftSidebarProps) {
  const mainNav = [
    { id: 'overview' as NavItem, label: 'Overview', icon: LayoutDashboard },
    { id: 'unified-inbox' as NavItem, label: 'Unified Inbox', icon: Inbox, badge: unreadCount },
    { id: 'whatsapp' as NavItem, label: 'WhatsApp Chats', icon: MessageSquare, accent: 'text-emerald-600' },
    { id: 'email' as NavItem, label: 'Email Threads', icon: Mail, accent: 'text-blue-600' },
  ];

  const viewsNav = [
    { id: 'handoff' as NavItem, label: 'Human Handoff', icon: UserCheck, badge: waitingHumanCount, badgeColor: 'bg-amber-500' },
    { id: 'ai-activity' as NavItem, label: 'AI Activity', icon: Bot },
    { id: 'starred' as NavItem, label: 'Starred Chats', icon: Star },
    { id: 'customers' as NavItem, label: 'All Customers', icon: Users },
    { id: 'archived' as NavItem, label: 'Archived', icon: Archive },
  ];

  const adminNav = [
    { id: 'analytics' as NavItem, label: 'Analytics', icon: BarChart3 },
    { id: 'settings' as NavItem, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col h-full select-none shrink-0 z-20">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-xs font-bold text-sm tracking-wider">
            PB
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-slate-900 tracking-tight">PhoneBuzz</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Wholesale Inbox CRM</p>
          </div>
        </div>
      </div>

      {/* Nav list */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Main Inbox */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Communication
          </div>
          <div className="space-y-0.5">
            {mainNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.accent || 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-white text-slate-900'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Smart Filters / Handoff */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Management & AI
          </div>
          <div className="space-y-0.5">
            {viewsNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white ${
                        item.badgeColor || 'bg-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Administration */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Platform
          </div>
          <div className="space-y-0.5">
            {adminNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Assistant Health Card */}
      <div className="p-3 border-t border-slate-100">
        <div className="p-3 rounded-xl bg-gradient-to-b from-slate-50 to-emerald-50/40 border border-emerald-100/60">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-semibold text-slate-800">Gemini Sales AI</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            n8n Automation Active · Syncing real-time wholesale pricing
          </p>
        </div>
      </div>
    </aside>
  );
}
