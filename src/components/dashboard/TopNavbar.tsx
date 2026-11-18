'use client';

import React, { useState } from 'react';
import { Search, Bell, BellOff, Sparkles, ChevronDown, ShieldCheck, FlaskConical } from 'lucide-react';

interface TopNavbarProps {
  onSearchChange?: (val: string) => void;
  searchValue?: string;
  viewerName?: string;
  viewerRole?: 'owner' | 'agent';
  demo?: boolean;
  whatsappLive?: boolean;
  waitingCount?: number;
  notificationsOn?: boolean;
  onToggleNotifications?: () => void;
  onSignOut?: () => void;
}

export function TopNavbar({
  onSearchChange,
  searchValue = '',
  viewerName = 'Staff',
  viewerRole = 'owner',
  demo = false,
  whatsappLive = false,
  waitingCount = 0,
  notificationsOn = false,
  onToggleNotifications,
  onSignOut,
}: TopNavbarProps) {
  const [profileDropdown, setProfileDropdown] = useState(false);
  const initials = viewerName
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 md:px-6 flex items-center justify-between gap-3 z-10 shrink-0">
      <div className="flex-1 max-w-lg min-w-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, number or message text..."
            value={searchValue}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-400 outline-none text-slate-800 placeholder-slate-400 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {demo ? (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-xs text-violet-800 font-semibold">
            <FlaskConical className="w-3.5 h-3.5" /> Demo mode (sample data, nothing is sent)
          </div>
        ) : (
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200/80 text-xs">
            <span className={`w-2 h-2 rounded-full ${whatsappLive ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <span className="text-slate-600 font-medium">{whatsappLive ? 'WhatsApp connected' : 'WhatsApp not configured'}</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-800 font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              {waitingCount} waiting for human
            </span>
          </div>
        )}

        <button
          onClick={onToggleNotifications}
          className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          title={notificationsOn ? 'Sound + browser alerts are ON for paused chats' : 'Turn on alerts for paused chats'}
        >
          {notificationsOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          {waitingCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>}
        </button>

        <div className="relative">
          <button
            onClick={() => setProfileDropdown(!profileDropdown)}
            className="flex items-center space-x-3 p-1 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {initials || 'PB'}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-slate-900">{viewerName}</div>
              <div className="text-[10px] text-slate-400 capitalize">{viewerRole}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {profileDropdown && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white border border-slate-200 shadow-xl py-1 text-xs z-50">
              <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2 text-slate-700">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Role: <span className="capitalize">{viewerRole}</span>
              </div>
              {!demo && (
                <button
                  onClick={() => {
                    setProfileDropdown(false);
                    onSignOut?.();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-rose-50 text-rose-600 font-medium"
                >
                  Sign out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
