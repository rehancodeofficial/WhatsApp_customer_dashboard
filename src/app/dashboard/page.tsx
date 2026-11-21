'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, LogOut } from 'lucide-react';
import { Button, Modal } from '@/components/app/ui';
import type { AIModeEvent, Conversation, Message } from '@/lib/types';
import { AppShell, allowedSections, type Section } from '@/components/app/AppShell';
import { OverviewView } from '@/components/app/views/OverviewView';
import { CustomersView } from '@/components/app/views/CustomersView';
import { InventoryView } from '@/components/app/views/InventoryView';
import { OrdersView } from '@/components/app/views/OrdersView';
import { SuppliersView } from '@/components/app/views/SuppliersView';
import { SourcingView } from '@/components/app/views/SourcingView';
import { BroadcastView } from '@/components/app/views/BroadcastView';
import { TeamView } from '@/components/app/views/TeamView';
import { NotificationBell, NotificationModal, NotificationsView, useNotifications, type NotificationRow } from '@/components/app/views/NotificationsView';
import { UnifiedChatList } from '@/components/dashboard/UnifiedChatList';
import { UnifiedChatHeader } from '@/components/dashboard/UnifiedChatHeader';
import { UnifiedMessageComposer } from '@/components/dashboard/UnifiedMessageComposer';
import { UnifiedMessageList } from '@/components/dashboard/UnifiedMessageList';
import { UnifiedCustomerPanel } from '@/components/dashboard/UnifiedCustomerPanel';
import { SettingsView } from '@/components/dashboard/SettingsView';
import { useSupabase } from '@/components/providers/SupabaseProvider';

interface MeInfo {
  viewer: { id: string; role: 'owner' | 'agent'; name: string; email: string; roleLabel: string };
  permissions: string[];
  demo: boolean;
  whatsappLive: boolean;
}
type Party = 'customer' | 'supplier';

const POLL_MS = 5000; // safety net if Realtime drops

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login';
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
  return data as T;
}

const partyOf = (c: Conversation): Party => (c.contact?.kind === 'supplier' ? 'supplier' : 'customer');

export default function DashboardPage() {
  const { supabase } = useSupabase();
  const [me, setMe] = useState<MeInfo | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [modeEvents, setModeEvents] = useState<AIModeEvent[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [openNotification, setOpenNotification] = useState<NotificationRow | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Prevent accidental back navigation from reopening login or exiting silently.
  // When user clicks the browser Back button, intercept it and show the in-app Logout confirmation modal.
  useEffect(() => {
    // Push an initial entry so there is an entry to intercept
    window.history.pushState({ dashboard: true }, '');

    const handlePopState = () => {
      // Re-push state so URL doesn't navigate away unexpectedly
      window.history.pushState({ dashboard: true }, '');
      setShowLogoutConfirm(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  useEffect(() => {
    api<MeInfo>('/api/me').then(setMe).catch(() => {});
  }, []);

  const perms = new Set(me?.permissions || []);
  const canChats = perms.has('chats.view') || perms.has('supplier_chats.view');
  const notif = useNotifications(perms.has('notifications.view'));

  const loadConversations = useCallback(async () => {
    try {
      const data = await api<{ conversations: Conversation[] }>('/api/conversations');
      setConversations(data.conversations);
      setListError(null);
    } catch (e: any) {
      setListError(e.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string, markRead = true) => {
    try {
      const data = await api<{ conversation: Conversation; messages: Message[]; events: AIModeEvent[] }>(`/api/conversations/${id}?markRead=${markRead}`);
      if (selectedRef.current !== id) return;
      setMessages(data.messages);
      setModeEvents(data.events);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...data.conversation } : c)));
    } catch (e: any) {
      if (e?.status === 404 && selectedRef.current === id) setSelectedId(null);
    }
  }, []);

  useEffect(() => {
    if (me && canChats) loadConversations();
  }, [me, canChats, loadConversations]);

  useEffect(() => {
    setMessages([]);
    setModeEvents([]);
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Live updates: Supabase Realtime when available, polling as a safety net.
  useEffect(() => {
    if (!me || !canChats) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadConversations();
        if (selectedRef.current) loadDetail(selectedRef.current, false);
      }, 300);
    };
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (supabase) {
      channel = supabase
        .channel('phonebuzz_chats')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, refresh)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => notif.reload())
        .subscribe();
    }
    const interval = setInterval(refresh, supabase ? POLL_MS * 4 : POLL_MS);
    return () => {
      clearInterval(interval);
      if (timer) clearTimeout(timer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
    // notif.reload is stable per permission
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, me, canChats, loadConversations, loadDetail]);

  const allowed = allowedSections(perms);
  useEffect(() => {
    if (!me) return;
    const ids = allowedSections(new Set(me.permissions)).map((s) => s.id);
    setSection((cur) => (cur && ids.includes(cur) ? cur : ids[0] ?? null));
  }, [me]);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await supabase?.auth.signOut().catch(() => {});
    window.location.href = '/login';
  };

  const patchConversation = useCallback(async (id: string, body: Record<string, unknown>) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...body } : c)));
    await api(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => {});
  }, []);

  const openChat = useCallback((conversationId: string, party: Party) => {
    setSection(party === 'supplier' ? 'supplier-chats' : 'customer-chats');
    setSelectedId(conversationId);
    setOpenNotification(null);
  }, []);

  // Link from an owner alert: /dashboard?chat=923001234567 opens that chat (customer or supplier).
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !me || !conversations.length) return;
    const wa = new URLSearchParams(window.location.search).get('chat');
    if (!wa) {
      deepLinkDone.current = true;
      return;
    }
    const digits = wa.replace(/[^0-9]/g, '');
    const c = conversations.find((x) => String(x.contact?.wa_id || '') === digits);
    if (c) {
      deepLinkDone.current = true;
      openChat(c.id, partyOf(c));
      window.history.replaceState(null, '', '/dashboard');
    }
  }, [me, conversations, openChat]);

  const openNotificationRow = (n: NotificationRow) => {
    setOpenNotification(n);
    if (!n.read_at) notif.markRead([n.id]);
  };

  if (!me) return <div className="h-dvh flex items-center justify-center bg-slate-50 text-sm text-slate-400">Loading…</div>;
  if (!allowed.length) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-3 bg-slate-50 text-center px-6">
        <p className="text-sm font-semibold text-slate-800">Your account has no permissions yet</p>
        <p className="text-xs text-slate-500 max-w-sm">Ask the Admin to give your account a role in Team &amp; Access.</p>
        <button onClick={signOut} className="text-sm rounded-full bg-slate-800 text-white px-4 py-2">Sign out</button>
      </div>
    );
  }

  const chatParty: Party | null = section === 'customer-chats' ? 'customer' : section === 'supplier-chats' ? 'supplier' : null;
  const partyChats = chatParty ? conversations.filter((c) => partyOf(c) === chatParty) : [];
  const selected = partyChats.find((c) => c.id === selectedId) || null;
  const unreadOf = (p: Party) => conversations.filter((c) => partyOf(c) === p && c.unread_count > 0 && !c.is_archived).length;

  // View-only chats: the AI and the customer / supplier. The owner replies from his own WhatsApp.
  const chats = chatParty && (
    <div className="h-full flex overflow-hidden bg-white rounded-3xl border border-slate-200/70">
      <div className={`${selected ? 'hidden' : 'flex'} md:flex w-full md:w-auto min-w-0`}>
        {loadingList ? (
          <div className="w-full md:w-80 p-6 text-xs text-slate-400">Loading chats...</div>
        ) : (
          <UnifiedChatList
            key={chatParty}
            conversations={partyChats}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            onToggleStar={(id, starred) => perms.has('chats.organize') && patchConversation(id, { is_starred: !starred })}
            initialFilter="all"
          />
        )}
      </div>
      <div className={`${selected ? 'flex' : 'hidden'} md:flex flex-1 flex-col h-full overflow-hidden min-w-0`}>
        {listError && <div className="px-4 py-2 text-xs bg-rose-50 text-rose-700">Could not load chats: {listError}</div>}
        {selected ? (
          <>
            <div className="flex items-center gap-1 md:hidden px-2 pt-2">
              <button onClick={() => setSelectedId(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 px-2 py-1.5 rounded-full hover:bg-slate-100">
                <ArrowLeft className="w-4 h-4" /> All chats
              </button>
            </div>
            <UnifiedChatHeader
              conversation={selected}
              onModeChange={async (mode, password) => {
                await api(`/api/conversations/${selected.id}/mode`, { method: 'POST', body: JSON.stringify({ mode, password }) });
                await loadConversations();
                await loadDetail(selected.id, false);
              }}
              onPaymentVerified={async () => {
                await loadConversations();
                await loadDetail(selected.id, false);
              }}
              canToggleAi={perms.has('ai.toggle')}
              isPanelOpen={panelOpen}
              onTogglePanel={chatParty === 'customer' ? () => setPanelOpen(!panelOpen) : undefined}
            />
            <UnifiedMessageList messages={messages} events={modeEvents} currentMode={selected.mode} party={chatParty} />
            {perms.has('chats.reply') && selected.channel !== 'email' && selected.mode === 'ai' ? (
              // While the AI is responding the reply box is off: switch to Human Responding first.
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex-1 min-w-[12rem] rounded-full border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed select-none">
                  AI is responding. Switch to Human Responding (top right) to reply.
                </div>
              </div>
            ) : perms.has('chats.reply') && selected.channel !== 'email' ? (
              // The owner replies here: translated to the customer's language, sent from the business
              // number, and the chat goes to "human" (AI paused) until he presses Resume AI.
              <UnifiedMessageComposer
                key={selected.id}
                conversationId={selected.id}
                channel="whatsapp"
                lastCustomerMessageAt={selected.last_customer_message_at}
                language={selected.contact?.preferred_language}
                onSendMessage={async (p) => {
                  await api('/api/messages/send', {
                    method: 'POST',
                    body: JSON.stringify({ conversation_id: selected.id, type: p.type, body: p.body, template_name: p.templateName, translate: p.translate ?? false }),
                  });
                  await loadDetail(selected.id, false);
                  await loadConversations();
                }}
              />
            ) : (
              <div className="px-4 py-2.5 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <span>View only. Replies happen on WhatsApp: the AI answers, or the Admin replies here.</span>
                <a href={`https://wa.me/${selected.contact?.wa_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
                  <ExternalLink className="w-3.5 h-3.5" /> Open in WhatsApp
                </a>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <h3 className="text-sm font-semibold text-slate-700">{partyChats.length ? 'Pick a chat' : `No ${chatParty} chats yet`}</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              {partyChats.length ? 'Choose a conversation on the left to read it.' : `Chats appear as soon as n8n forwards the first ${chatParty} WhatsApp message.`}
            </p>
          </div>
        )}
      </div>
      {selected && chatParty === 'customer' && panelOpen && (
        <div className="hidden 2xl:flex">
          <UnifiedCustomerPanel conversation={selected} modeEvents={modeEvents} />
        </div>
      )}
    </div>
  );

  return (
    <>
      <AppShell
        section={section || allowed[0].id}
        onSection={(s) => {
          setSection(s);
          if (s !== 'customer-chats' && s !== 'supplier-chats') setSelectedId(null);
        }}
        perms={perms}
        user={{ name: me.viewer.name, email: me.viewer.email, roleLabel: me.viewer.roleLabel }}
        badges={{ 'customer-chats': unreadOf('customer'), 'supplier-chats': unreadOf('supplier'), notifications: notif.data?.unread }}
        bell={perms.has('notifications.view') ? <NotificationBell data={notif.data} onOpen={openNotificationRow} onSeeAll={() => setSection('notifications')} markRead={notif.markRead} /> : undefined}
        onSignOut={signOut}
      >
        {section === 'overview' && <OverviewView name={me.viewer.name} perms={perms} onOpen={(s) => setSection(s)} />}
        {section === 'notifications' && <NotificationsView data={notif.data} markRead={notif.markRead} onOpen={openNotificationRow} />}
        {chats}
        {section === 'customers' && (
          <CustomersView
            perms={perms}
            onOpenInbox={(id) => openChat(id, 'customer')}
            onOpenOrders={() => setSection('orders')}
          />
        )}
        {section === 'inventory' && <InventoryView perms={perms} />}
        {section === 'orders' && <OrdersView perms={perms} />}
        {section === 'suppliers' && <SuppliersView perms={perms} />}
        {section === 'sourcing' && <SourcingView />}
        {section === 'broadcast' && <BroadcastView />}
        {section === 'team' && <TeamView currentUserId={me.viewer.id} />}
        {section === 'settings' && (
          <div className="h-full overflow-y-auto bg-white rounded-3xl border border-slate-200/70">
            <SettingsView demo={me.demo} whatsappLive={me.whatsappLive} />
          </div>
        )}
      </AppShell>
      <NotificationModal
        n={openNotification}
        onClose={() => setOpenNotification(null)}
        onOpenChat={canChats ? openChat : undefined}
        onOpenOrders={perms.has('orders.view') ? () => { setOpenNotification(null); setSection('orders'); } : undefined}
      />
      {showLogoutConfirm && (
        <Modal open onClose={() => setShowLogoutConfirm(false)} title="Sign out confirmation">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              You clicked Back in your browser. Do you want to sign out of your account, or stay on the dashboard?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="light" onClick={() => setShowLogoutConfirm(false)}>
                Stay on dashboard
              </Button>
              <Button variant="danger" onClick={signOut}>
                <LogOut className="w-4 h-4" /> Sign out
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
