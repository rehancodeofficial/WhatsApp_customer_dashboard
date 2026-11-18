'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AIModeEvent, Conversation, ConversationMode, Message } from '@/lib/types';
import { LeftSidebar, NavItem } from '@/components/dashboard/LeftSidebar';
import { TopNavbar } from '@/components/dashboard/TopNavbar';
import { UnifiedChatList } from '@/components/dashboard/UnifiedChatList';
import { UnifiedChatHeader } from '@/components/dashboard/UnifiedChatHeader';
import { UnifiedMessageList } from '@/components/dashboard/UnifiedMessageList';
import { UnifiedMessageComposer } from '@/components/dashboard/UnifiedMessageComposer';
import { UnifiedCustomerPanel } from '@/components/dashboard/UnifiedCustomerPanel';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { CustomerListView } from '@/components/dashboard/CustomerListView';
import { DemoSimulator } from '@/components/dashboard/DemoSimulator';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { computeStats } from '@/lib/repo/logic';

interface MeInfo {
  viewer: { id: string | null; role: 'owner' | 'agent'; name?: string };
  demo: boolean;
  whatsappLive: boolean;
}

const POLL_MS = 4000; // used in demo mode, and as a safety net if Realtime drops

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login';
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
  return data as T;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const gain = ctx.createGain();
    o.frequency.value = 880;
    gain.gain.value = 0.08;
    o.connect(gain).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
  } catch {}
}

export default function DashboardPage() {
  const router = useRouter();
  const { supabase } = useSupabase();
  const [me, setMe] = useState<MeInfo | null>(null);
  const [currentTab, setCurrentTab] = useState<NavItem>('unified-inbox');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [modeEvents, setModeEvents] = useState<AIModeEvent[]>([]);
  const [isCustomerPanelOpen, setIsCustomerPanelOpen] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  const searchRef = useRef('');
  searchRef.current = globalSearch;
  const lastSeenRef = useRef<Record<string, string>>({});
  const notifRef = useRef(false);
  notifRef.current = notificationsOn;

  useEffect(() => {
    try {
      setNotificationsOn(localStorage.getItem('pb_notifications') === 'on');
    } catch {}
    api<MeInfo>('/api/me').then(setMe).catch(() => {});
  }, []);

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 3500);
  };

  // Alert when a customer writes in a chat where the AI is paused (a human must answer).
  const checkForAlerts = useCallback((list: Conversation[]) => {
    const seen = lastSeenRef.current;
    const first = Object.keys(seen).length === 0;
    for (const c of list) {
      const prev = seen[c.id];
      seen[c.id] = c.last_customer_message_at || '';
      if (first || !c.last_customer_message_at || prev === c.last_customer_message_at) continue;
      if (c.mode !== 'ai' && notifRef.current) {
        beep();
        const name = c.contact?.name || `+${c.contact?.wa_id}`;
        try {
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(`New message from ${name}`, { body: c.last_message_preview || '', tag: c.id });
          }
        } catch {}
      }
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const q = searchRef.current.trim();
      const data = await api<{ conversations: Conversation[] }>(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setConversations(data.conversations);
      setListError(null);
      if (!q) checkForAlerts(data.conversations);
      setSelectedId((cur) => cur ?? (window.innerWidth >= 768 ? data.conversations[0]?.id ?? null : null));
    } catch (e: any) {
      setListError(e.message);
    } finally {
      setLoadingList(false);
    }
  }, [checkForAlerts]);

  const loadDetail = useCallback(async (id: string, markRead = true) => {
    try {
      const data = await api<{ conversation: Conversation; messages: Message[]; events: AIModeEvent[] }>(
        `/api/conversations/${id}?markRead=${markRead}`
      );
      if (selectedRef.current !== id) return;
      setMessages(data.messages);
      setModeEvents(data.events);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...data.conversation } : c)));
    } catch (e: any) {
      // The chat no longer exists or was re-assigned away from this agent.
      if (e?.status === 404 && selectedRef.current === id) setSelectedId(null);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Re-search when the search box changes (debounced)
  useEffect(() => {
    const t = setTimeout(loadConversations, 300);
    return () => clearTimeout(t);
  }, [globalSearch, loadConversations]);

  useEffect(() => {
    setMessages([]);
    setModeEvents([]);
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Live updates: Supabase Realtime when available, polling otherwise (and as a safety net).
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        loadConversations();
        if (selectedRef.current) loadDetail(selectedRef.current);
      }, 250);
    };
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (supabase) {
      channel = supabase
        .channel('phonebuzz_inbox')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
          const m = payload.new as Message;
          if (m?.conversation_id && m.conversation_id === selectedRef.current) {
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m]));
          }
          refresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, refresh)
        .subscribe();
    }
    const interval = setInterval(refresh, supabase ? POLL_MS * 5 : POLL_MS);
    return () => {
      clearInterval(interval);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [supabase, loadConversations, loadDetail]);

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;

  const handleModeChange = useCallback(
    async (mode: ConversationMode, resumeMinutes?: number) => {
      if (!selectedId) return;
      try {
        const { conversation } = await api<{ conversation: Conversation }>(`/api/conversations/${selectedId}/mode`, {
          method: 'POST',
          body: JSON.stringify({ mode, resume_in_minutes: resumeMinutes ?? null }),
        });
        setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...conversation, contact: c.contact } : c)));
        showToast(mode === 'ai' ? 'AI is back on for this customer' : mode === 'human' ? 'AI paused. You are now talking to this customer.' : 'Marked as sales handoff');
        loadDetail(selectedId, false);
      } catch (e: any) {
        showToast('Could not change mode: ' + e.message);
      }
    },
    [selectedId, loadDetail]
  );

  const handleRunAiNow = useCallback(async () => {
    if (!selectedId) return;
    try {
      await api(`/api/conversations/${selectedId}/run-ai`, { method: 'POST' });
      showToast('AI resumed and is replying to the last message');
      loadConversations();
      setTimeout(() => selectedRef.current && loadDetail(selectedRef.current, false), 600);
    } catch (e: any) {
      showToast('Could not start the AI: ' + e.message);
    }
  }, [selectedId, loadConversations, loadDetail]);

  const handleSendMessage = useCallback(
    async (payload: { type: 'text' | 'template'; body?: string; templateName?: string }) => {
      if (!selectedId) return;
      const tempId = `temp_${Date.now()}`;
      const optimistic: Message = {
        id: tempId,
        conversation_id: selectedId,
        channel: 'whatsapp',
        wa_message_id: null,
        direction: 'outbound',
        sender_type: 'agent',
        sender_user_id: me?.viewer.id ?? null,
        type: payload.type,
        body: payload.body || (payload.type === 'template' ? `[Template: ${payload.templateName}]` : null),
        media_url: null,
        media_mime: null,
        transcript_or_caption: null,
        status: 'queued',
        error_code: null,
        error_message: null,
        raw: {},
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      try {
        const { message } = await api<{ message: Message }>('/api/messages/send', {
          method: 'POST',
          body: JSON.stringify({ conversation_id: selectedId, type: payload.type, body: payload.body, template_name: payload.templateName }),
        });
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== tempId);
          return without.some((m) => m.id === message.id) ? without : [...without, message];
        });
        loadConversations();
        loadDetail(selectedId, false);
      } catch (e: any) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed', error_message: e.message } : m)));
      }
    },
    [selectedId, me, loadConversations, loadDetail]
  );

  const patchConversation = useCallback(async (id: string, body: Record<string, unknown>) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...body } : c)));
    try {
      await api(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    } catch (e: any) {
      showToast('Could not save: ' + e.message);
    }
  }, []);

  const toggleNotifications = async () => {
    const next = !notificationsOn;
    if (next && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }
    setNotificationsOn(next);
    try {
      localStorage.setItem('pb_notifications', next ? 'on' : 'off');
    } catch {}
    showToast(next ? 'Alerts on: you will hear a sound when a paused chat gets a message' : 'Alerts off');
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const stats = computeStats(conversations);
  const waitingHumanTotal = conversations.filter((c) => c.mode !== 'ai' && !c.is_archived).length;

  const filterFromTab = (): string => {
    switch (currentTab) {
      case 'whatsapp':
        return 'whatsapp';
      case 'email':
        return 'email';
      case 'handoff':
        return 'human';
      case 'ai-activity':
        return 'ai';
      case 'starred':
        return 'starred';
      case 'archived':
        return 'archived';
      default:
        return 'all';
    }
  };

  const showList = !selectedConversation;

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-slate-50 font-sans antialiased text-slate-800">
      <div className="hidden md:flex">
        <LeftSidebar
          currentTab={currentTab}
          onTabChange={(tab) => setCurrentTab(tab)}
          unreadCount={stats.unreadMessages}
          waitingHumanCount={waitingHumanTotal}
        />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <TopNavbar
          searchValue={globalSearch}
          onSearchChange={setGlobalSearch}
          viewerName={me?.viewer.name || 'Staff'}
          viewerRole={me?.viewer.role || 'owner'}
          demo={me?.demo}
          whatsappLive={me?.whatsappLive}
          waitingCount={waitingHumanTotal}
          notificationsOn={notificationsOn}
          onToggleNotifications={toggleNotifications}
          onSignOut={signOut}
        />

        {listError && (
          <div className="px-4 py-2 text-xs bg-rose-50 text-rose-700 border-b border-rose-200">Could not load chats: {listError}</div>
        )}

        {currentTab === 'overview' || currentTab === 'analytics' ? (
          <DashboardOverview
            stats={stats}
            recentConversations={conversations}
            onOpenChat={(id) => {
              setSelectedId(id);
              setCurrentTab('unified-inbox');
            }}
          />
        ) : currentTab === 'customers' ? (
          <CustomerListView
            contacts={conversations.map((c) => c.contact!).filter(Boolean)}
            onOpenChatWithContact={(waId) => {
              const match = conversations.find((c) => c.contact?.wa_id === waId);
              if (match) setSelectedId(match.id);
              setCurrentTab('unified-inbox');
            }}
          />
        ) : (
          <div className="flex-1 flex overflow-hidden">
            <div className={`${showList ? 'flex' : 'hidden'} md:flex w-full md:w-auto`}>
              {loadingList ? (
                <div className="w-full md:w-80 p-6 text-xs text-slate-400">Loading chats...</div>
              ) : (
                <UnifiedChatList
                  key={currentTab}
                  conversations={conversations}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedId(id)}
                  onToggleStar={(id, starred) => patchConversation(id, { is_starred: !starred })}
                  initialFilter={filterFromTab()}
                />
              )}
            </div>

            <div className={`${showList ? 'hidden' : 'flex'} md:flex flex-1 flex-col h-full overflow-hidden bg-white min-w-0`}>
              {selectedConversation ? (
                <>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="md:hidden text-left px-4 py-2 text-xs font-semibold text-emerald-700 border-b border-slate-100"
                  >
                    ← All chats
                  </button>
                  <UnifiedChatHeader
                    conversation={selectedConversation}
                    onModeChange={handleModeChange}
                    onTriggerAiNow={handleRunAiNow}
                    isPanelOpen={isCustomerPanelOpen}
                    onTogglePanel={() => setIsCustomerPanelOpen(!isCustomerPanelOpen)}
                  />
                  <UnifiedMessageList messages={messages} channel={selectedConversation.channel} />
                  <UnifiedMessageComposer
                    conversationId={selectedConversation.id}
                    channel={selectedConversation.channel}
                    lastCustomerMessageAt={selectedConversation.last_customer_message_at}
                    onSendMessage={handleSendMessage}
                  />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <h3 className="text-sm font-bold text-slate-700">{conversations.length ? 'No chat selected' : 'No chats yet'}</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    {conversations.length
                      ? 'Pick a customer on the left to read the chat or reply.'
                      : 'Chats appear here as soon as n8n forwards the first customer WhatsApp message.'}
                  </p>
                </div>
              )}
            </div>

            {selectedConversation && isCustomerPanelOpen && (
              <div className="hidden xl:flex">
                <UnifiedCustomerPanel
                  conversation={selectedConversation}
                  modeEvents={modeEvents}
                  onUpdatePaymentStatus={(status) => patchConversation(selectedConversation.id, { payment_status: status })}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {me?.demo && (
        <DemoSimulator
          conversations={conversations}
          selectedWaId={selectedConversation?.contact?.wa_id}
          onDone={() => {
            loadConversations();
            if (selectedRef.current) loadDetail(selectedRef.current);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-slate-900 text-white text-xs px-4 py-2.5 shadow-lg">{toast}</div>
      )}
    </div>
  );
}
