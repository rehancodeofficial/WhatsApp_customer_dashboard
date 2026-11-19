'use client';
// Owner notifications: everything the AI sends to the owner on WhatsApp also lands here.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, MessageCircle, ShoppingCart } from 'lucide-react';
import type { OwnerNotification } from '@/lib/biz/types';
import { NOTIFICATION_TYPES } from '@/lib/biz/notifications';
import { api, Button, Card, cx, dateTime, Empty, ErrorNote, Loading, Modal, PageHeader, PillTabs, SearchInput, StatusDot } from '../ui';
import { ExportButton } from '../ExportButton';

export type NotificationRow = OwnerNotification & { conversation_id: string | null };

export interface OpenChat {
  (conversationId: string, party: 'customer' | 'supplier'): void;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

export function useNotifications(enabled: boolean) {
  const [data, setData] = useState<{ unread: number; notifications: NotificationRow[] } | null>(null);
  const load = useCallback(() => {
    if (!enabled) return;
    api<{ unread: number; notifications: NotificationRow[] }>('/api/notifications?limit=200').then(setData).catch(() => {});
  }, [enabled]);
  useEffect(() => {
    load();
    if (!enabled) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load, enabled]);
  const markRead = async (ids: string[] | 'all') => {
    await api('/api/notifications', { method: 'POST', body: JSON.stringify({ ids }) }).catch(() => {});
    load();
  };
  return { data, reload: load, markRead };
}

function TypeDot({ type }: { type: string }) {
  const t = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.info;
  return <StatusDot color={t.color} label={t.label} />;
}

/** Top-bar bell with the latest notifications. */
export function NotificationBell({ data, onOpen, onSeeAll }: { data: { unread: number; notifications: NotificationRow[] } | null; onOpen: (n: NotificationRow) => void; onSeeAll: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative w-10 h-10 rounded-full bg-white border border-slate-200/70 flex items-center justify-center text-slate-600 hover:text-slate-800"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            <span className="text-xs text-slate-500">{unread} unread</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {!data ? (
              <Loading />
            ) : !data.notifications.length ? (
              <Empty title="No notifications yet" />
            ) : (
              data.notifications.slice(0, 8).map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setOpen(false);
                    onOpen(n);
                  }}
                  className={cx('w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3', !n.read_at && 'bg-orange-50/50')}
                >
                  <span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', n.read_at ? 'bg-transparent' : 'bg-orange-500')} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{n.title}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">{ago(n.created_at)}</span>
                    </span>
                    <span className="block text-xs text-slate-500 line-clamp-2 mt-0.5 whitespace-pre-line">{n.body.split('\n').filter(Boolean).slice(1).join(' · ')}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <button onClick={() => { setOpen(false); onSeeAll(); }} className="w-full py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 border-t border-slate-100">
            See all notifications
          </button>
        </div>
      )}
    </div>
  );
}

/** Full notification with links to the dashboard chat, WhatsApp and the order. */
export function NotificationModal({ n, onClose, onOpenChat, onOpenOrders }: { n: NotificationRow | null; onClose: () => void; onOpenChat?: OpenChat; onOpenOrders?: () => void }) {
  if (!n) return null;
  const party = n.party === 'supplier' ? 'supplier' : 'customer';
  return (
    <Modal open onClose={onClose} title={n.title}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <TypeDot type={n.type} />
          <span>{dateTime(n.created_at)}</span>
        </div>
        <div className="rounded-2xl bg-[#f5efe6] p-3">
          <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] text-slate-800 whitespace-pre-wrap break-words shadow-sm">{n.body}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {n.conversation_id && onOpenChat && (
            <Button onClick={() => onOpenChat(n.conversation_id!, party)}>
              <MessageCircle className="w-4 h-4" /> Open {party} chat
            </Button>
          )}
          {n.wa_id && (
            <a
              href={`https://wa.me/${n.wa_id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full text-sm px-4 py-2.5 font-medium bg-[#25D366] text-white hover:opacity-90"
            >
              <ExternalLink className="w-4 h-4" /> WhatsApp +{n.wa_id}
            </a>
          )}
          {n.order_no && onOpenOrders && (
            <Button variant="light" onClick={onOpenOrders}>
              <ShoppingCart className="w-4 h-4" /> {n.order_no}
            </Button>
          )}
        </div>
        {n.request_code && <p className="text-xs text-slate-500">Supplier request {n.request_code}</p>}
      </div>
    </Modal>
  );
}

export function NotificationsView({
  data,
  markRead,
  onOpen,
}: {
  data: { unread: number; notifications: NotificationRow[] } | null;
  markRead: (ids: string[] | 'all') => Promise<void>;
  onOpen: (n: NotificationRow) => void;
}) {
  const [tab, setTab] = useState<'all' | 'unread' | string>('all');
  const [q, setQ] = useState('');
  const list = (data?.notifications || []).filter((n) => {
    if (tab === 'unread' && n.read_at) return false;
    if (tab !== 'all' && tab !== 'unread' && n.type !== tab) return false;
    return !q || `${n.title} ${n.body} ${n.wa_id}`.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <div className="h-full overflow-y-auto pr-1">
      <PageHeader
        title="Notifications"
        subtitle="Every alert the AI sends to the owner on WhatsApp. Open one to jump to the chat or WhatsApp."
        right={
          <>
            <ExportButton entity="notifications" />
            <Button variant="ghost" onClick={() => markRead('all')} disabled={!data?.unread}>
              <CheckCheck className="w-4 h-4" /> Mark all read
            </Button>
          </>
        }
      />
      <ErrorNote text={null} />
      <Card>
        <div className="flex flex-col lg:flex-row gap-3 justify-between mb-4">
          <PillTabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'all', label: 'All', count: data?.notifications.length },
              { id: 'unread', label: 'Unread', count: data?.unread },
              ...Object.entries(NOTIFICATION_TYPES).map(([id, t]) => ({ id, label: t.label })),
            ]}
          />
          <SearchInput value={q} onChange={setQ} placeholder="Search notifications" />
        </div>
        {!data ? (
          <Loading />
        ) : !list.length ? (
          <Empty title="Nothing here" text="Notifications appear when n8n sends the owner an alert (see N8N_CHANGES.md step 10)." />
        ) : (
          <div className="divide-y divide-slate-100 -mx-2">
            {list.map((n) => (
              <button key={n.id} onClick={() => onOpen(n)} className={cx('w-full text-left px-3 py-3 rounded-2xl hover:bg-slate-50 flex gap-3', !n.read_at && 'bg-orange-50/40')}>
                <span className={cx('mt-2 w-2 h-2 rounded-full shrink-0', n.read_at ? 'bg-slate-200' : 'bg-orange-500')} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-slate-800">{n.title}</span>
                    <TypeDot type={n.type} />
                    <span className="text-xs text-slate-400 ml-auto">{dateTime(n.created_at)}</span>
                  </span>
                  <span className="block text-xs text-slate-600 mt-1 line-clamp-3 whitespace-pre-line">{n.body}</span>
                  <span className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-slate-500">
                    {n.wa_id && <span>+{n.wa_id}</span>}
                    {n.order_no && <span>{n.order_no}</span>}
                    {n.request_code && <span>{n.request_code}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
