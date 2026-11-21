'use client';
import React, { useEffect, useRef, useState } from 'react';
import { InstallAppButton } from '@/components/InstallApp';
import {
  Bell,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { cx } from './ui';

export type Section =
  | 'overview'
  | 'customer-chats'
  | 'supplier-chats'
  | 'notifications'
  | 'customers'
  | 'orders'
  | 'inventory'
  | 'suppliers'
  | 'sourcing'
  | 'broadcast'
  | 'team'
  | 'settings';

type Icon = React.ComponentType<{ className?: string }>;
export const SECTIONS: { id: Section; label: string; icon: Icon; perm: string; group: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, perm: 'stats.view', group: 'Main' },
  { id: 'notifications', label: 'Notifications', icon: Bell, perm: 'notifications.view', group: 'Main' },
  { id: 'customer-chats', label: 'Customer Chats', icon: MessageCircle, perm: 'chats.view', group: 'Chats' },
  { id: 'supplier-chats', label: 'Supplier Chats', icon: Truck, perm: 'supplier_chats.view', group: 'Chats' },
  { id: 'customers', label: 'Customers', icon: Users, perm: 'customers.view', group: 'Records' },
  { id: 'orders', label: 'Orders', icon: ShoppingCart, perm: 'orders.view', group: 'Records' },
  { id: 'inventory', label: 'Inventory', icon: Package, perm: 'inventory.view', group: 'Records' },
  { id: 'suppliers', label: 'Suppliers', icon: Truck, perm: 'suppliers.view', group: 'Records' },
  { id: 'sourcing', label: 'Supplier Requests', icon: ClipboardList, perm: 'suppliers.view', group: 'Records' },
  { id: 'broadcast', label: 'Broadcast', icon: Megaphone, perm: 'broadcast.send', group: 'Marketing' },
  { id: 'team', label: 'Team & Access', icon: ShieldCheck, perm: 'staff.manage', group: 'Admin' },
  // Everyone: own profile, password and two-factor sign-in.
  { id: 'settings', label: 'Settings', icon: Settings, perm: '*', group: 'Account' },
];

export function allowedSections(perms: Set<string>) {
  return SECTIONS.filter((s) => s.perm === '*' || perms.has(s.perm));
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="rounded-2xl bg-slate-800 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <img src="/logo.png" alt="Phone Buzz" style={{ width: size * 0.82, height: size * 0.82 }} />
    </span>
  );
}

function SidebarNav({
  items,
  section,
  onSection,
  collapsed,
  badges,
  onSignOut,
}: {
  items: (typeof SECTIONS)[number][];
  section: Section;
  onSection: (s: Section) => void;
  collapsed: boolean;
  badges?: Partial<Record<Section, number>>;
  onSignOut: () => void;
}) {
  const groups = Array.from(new Set(items.map((i) => i.group)));
  return (
    <nav className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {groups.map((g) => (
          <div key={g}>
            {!collapsed && <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g}</div>}
            <div className="space-y-0.5">
              {items
                .filter((i) => i.group === g)
                .map((s) => {
                  const Icon = s.icon;
                  const active = section === s.id;
                  const badge = badges?.[s.id];
                  return (
                    <button
                      key={s.id}
                      onClick={() => onSection(s.id)}
                      title={collapsed ? s.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'group relative w-full flex items-center gap-3 rounded-xl text-sm transition-colors',
                        collapsed ? 'justify-center h-11' : 'px-3 h-10',
                        active ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                      )}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      {!collapsed && <span className="flex-1 text-left truncate">{s.label}</span>}
                      {!!badge && (
                        <span className={cx('min-w-5 h-5 px-1.5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center', collapsed && 'absolute top-0.5 right-0.5 min-w-4 h-4 px-1 text-[9px]')}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              {/* Right under Settings: install the dashboard as a phone / desktop app. */}
              {g === 'Account' && <InstallAppButton collapsed={collapsed} />}
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 py-3 border-t border-slate-100">
        <button
          onClick={onSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={cx('w-full flex items-center gap-3 rounded-xl text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600', collapsed ? 'justify-center h-11' : 'px-3 h-10')}
        >
          <LogOut className="w-[18px] h-[18px]" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </nav>
  );
}

export function AppShell({
  section,
  onSection,
  perms,
  user,
  badges,
  bell,
  onSignOut,
  children,
}: {
  section: Section;
  onSection: (s: Section) => void;
  perms: Set<string>;
  user: { name: string; email?: string; roleLabel: string };
  badges?: Partial<Record<Section, number>>;
  /** Notification bell (rendered in the top bar). */
  bell?: React.ReactNode;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const items = allowedSections(perms);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('pb_sidebar') === 'collapsed');
    } catch {}
    const h = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('pb_sidebar', c ? 'expanded' : 'collapsed');
      } catch {}
      return !c;
    });
  };
  const go = (s: Section) => {
    onSection(s);
    setDrawer(false);
  };
  const current = SECTIONS.find((s) => s.id === section);

  return (
    <div className="h-dvh w-full flex bg-slate-100/70 text-slate-800 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className={cx('hidden md:flex flex-col shrink-0 bg-white border-r border-slate-200/70 transition-[width] duration-200', collapsed ? 'w-[76px]' : 'w-64')}>
        <div className={cx('flex items-center gap-2.5 h-16 shrink-0', collapsed ? 'justify-center' : 'px-5')}>
          <Logo size={collapsed ? 38 : 36} />
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold text-slate-800">PhoneBuzz</div>
              <div className="text-[11px] text-slate-500">Sales & Inventory</div>
            </div>
          )}
        </div>
        <SidebarNav items={items} section={section} onSection={go} collapsed={collapsed} badges={badges} onSignOut={onSignOut} />
        <button
          onClick={toggleCollapsed}
          className="h-10 shrink-0 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-800"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <><ChevronsLeft className="w-4 h-4" /> Collapse</>}
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="relative w-72 max-w-[85%] h-full bg-white flex flex-col shadow-xl">
            <div className="flex items-center justify-between h-16 px-5 shrink-0">
              <div className="flex items-center gap-2.5">
                <Logo size={36} />
                <div className="leading-tight">
                  <div className="text-sm font-semibold">PhoneBuzz</div>
                  <div className="text-[11px] text-slate-500">Sales & Inventory</div>
                </div>
              </div>
              <button onClick={() => setDrawer(false)} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center" aria-label="Close menu">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarNav items={items} section={section} onSection={go} collapsed={false} badges={badges} onSignOut={onSignOut} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar: page title, bell, user. No section links here. */}
        <header className="shrink-0 h-16 flex items-center gap-3 px-4 sm:px-6">
          <button onClick={() => setDrawer(true)} className="md:hidden w-10 h-10 rounded-full bg-white border border-slate-200/70 flex items-center justify-center" aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-base sm:text-lg font-semibold text-slate-800 truncate">{current?.label}</h1>
          <div className="ml-auto flex items-center gap-2">
            {bell}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 bg-white rounded-full pl-1 pr-2 sm:pr-3 py-1 border border-slate-200/70">
                <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">
                  {user.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </span>
                <span className="hidden sm:block text-left leading-tight">
                  <span className="block text-xs font-semibold text-slate-800 max-w-36 truncate">{user.name}</span>
                  <span className="block text-[10px] text-slate-500">{user.roleLabel}</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-lg p-2 z-40">
                  <div className="px-3 py-2">
                    <div className="text-sm font-semibold text-slate-800 truncate">{user.name}</div>
                    <div className="text-xs text-slate-500 truncate">{user.email}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{user.roleLabel}</div>
                  </div>
                  <button onClick={onSignOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-rose-600 hover:bg-rose-50">
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-hidden px-3 sm:px-6 pb-3 sm:pb-6">{children}</main>
      </div>
    </div>
  );
}
