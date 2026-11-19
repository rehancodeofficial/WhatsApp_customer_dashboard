'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MessageSquare, Plus } from 'lucide-react';
import type { CustomerView } from '@/lib/biz/types';
import type { AIModeEvent, Message } from '@/lib/types';
import { ExportButton } from '../ExportButton';
import { BarList } from '../charts';
import { UnifiedMessageList } from '@/components/dashboard/UnifiedMessageList';
import { api, Avatar, Button, Card, Chip, ChipSelect, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, money, PillTabs, SearchInput, shortDate, StatusDot, TierBadge, TIER_LABEL } from '../ui';
import { ORDER_STATUS } from './OrdersView';

type Tab = 'chat' | 'orders' | 'details';

export function CustomersView({ perms, onOpenInbox }: { perms: Set<string>; onOpenInbox?: (conversationId: string) => void }) {
  const [list, setList] = useState<CustomerView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tiers, setTiers] = useState<string[]>([]);
  const [country, setCountry] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api<{ customers: CustomerView[] }>('/api/biz/customers')
      .then((d) => {
        const sorted = [...d.customers].sort((a, b) => b.total_spent - a.total_spent);
        setList(sorted);
        setSel((cur) => cur ?? (typeof window !== 'undefined' && window.innerWidth >= 1024 ? sorted[0]?.id ?? null : null));
      })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const countries = useMemo(() => Array.from(new Set((list || []).map((c) => c.country).filter(Boolean) as string[])).sort(), [list]);
  const shown = (list || []).filter((c) => {
    if (tiers.length && !tiers.includes(c.tier)) return false;
    if (country !== 'all' && c.country !== country) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [c.name, c.wa_id, c.company, c.country, ...c.brands].some((v) => v && v.toLowerCase().includes(t));
  });
  const current = list?.find((c) => c.id === sel) || null;

  const [view, setView] = useState<'list' | 'insights'>('list');
  if (view === 'insights') return <Insights list={list} onBack={() => setView('list')} />;

  return (
    <div className="h-full flex gap-4 min-h-0">
      {/* List */}
      <Card className={cx('w-full lg:w-[360px] shrink-0 flex flex-col min-h-0 p-4', current && 'hidden lg:flex')}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Customers</h2>
            <p className="text-xs text-slate-500">{list ? `${shown.length} of ${list.length}` : 'Loading'}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setView('insights')}>Insights</Button>
            {perms.has('customers.manage') && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            )}
          </div>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Name, number, brand" />
        <div className="flex gap-2 mt-3 items-center">
          <select className={cx(inputCls, 'rounded-full py-1.5 text-xs w-36')} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <ChipSelect options={['high', 'medium', 'low']} value={tiers} onChange={setTiers} render={(o) => (o === 'high' ? 'High' : o === 'medium' ? 'Mid' : 'Low')} />
        </div>
        <ErrorNote text={err} />
        <div className="flex-1 min-h-0 overflow-y-auto -mx-2 mt-3">
          {!list ? (
            <Loading />
          ) : !shown.length ? (
            <Empty title="No customers match" />
          ) : (
            shown.map((c) => (
              <button
                key={c.id}
                onClick={() => setSel(c.id)}
                className={cx('w-full flex items-center gap-3 px-2 py-2.5 rounded-2xl text-left transition-colors', sel === c.id ? 'bg-orange-50' : 'hover:bg-slate-50')}
              >
                <Avatar name={c.name || c.wa_id} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 truncate">{c.name || `+${c.wa_id}`}</span>
                    <span className="text-[11px] text-slate-400 shrink-0">{c.last_order_at ? shortDate(c.last_order_at) : ''}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 truncate">{c.country || 'Unknown country'} · {c.brands.slice(0, 2).join(', ') || 'no brands yet'}</span>
                    <TierBadge tier={c.tier} auto={c.tier_auto} />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </Card>

      {/* Detail */}
      <div className={cx('flex-1 min-w-0 min-h-0', !current && 'hidden lg:block')}>
        {current ? (
          <CustomerDetail key={current.id} c={current} perms={perms} onBack={() => setSel(null)} onSaved={load} onOpenInbox={onOpenInbox} />
        ) : (
          <Card className="h-full flex items-center justify-center">
            <Empty title="Pick a customer" text="Their chat with the AI, orders and record open here." />
          </Card>
        )}
      </div>

      {adding && (
        <CustomerModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CustomerDetail({ c, perms, onBack, onSaved, onOpenInbox }: { c: CustomerView; perms: Set<string>; onBack: () => void; onSaved: () => void; onOpenInbox?: (id: string) => void }) {
  const canChat = perms.has('chats.view') && !!c.conversation_id;
  const [tab, setTab] = useState<Tab>(canChat ? 'chat' : perms.has('orders.view') ? 'orders' : 'details');
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [events, setEvents] = useState<AIModeEvent[]>([]);
  const [inquiries, setInquiries] = useState<any[] | null>(null);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [editing, setEditing] = useState(false);
  const canOrders = perms.has('orders.view');

  useEffect(() => {
    if (tab === 'chat' && canChat && !messages) {
      api<{ messages: Message[]; events: AIModeEvent[] }>(`/api/conversations/${c.conversation_id}?markRead=false`)
        .then((d) => {
          setMessages(d.messages);
          setEvents(d.events || []);
        })
        .catch(() => setMessages([]));
    }
    if (tab === 'orders' && !orders && canOrders) {
      api<{ orders: any[] }>('/api/biz/orders').then((d) => setOrders(d.orders.filter((o) => o.contact_id === c.id))).catch(() => setOrders([]));
    }
    if (tab === 'details' && !inquiries) {
      api<{ inquiries: any[] }>(`/api/biz/customers/${c.id}`).then((d) => setInquiries(d.inquiries)).catch(() => setInquiries([]));
    }
  }, [tab, c, canChat, messages, orders, canOrders, inquiries]);

  const tabs = [
    ...(canChat ? [{ id: 'chat' as Tab, label: 'Chat' }] : []),
    ...(perms.has('orders.view') ? [{ id: 'orders' as Tab, label: 'Orders', count: c.order_count }] : []),
    { id: 'details' as Tab, label: 'Details' },
  ];

  return (
    <Card className="h-full flex flex-col min-h-0 p-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="lg:hidden w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Avatar name={c.name || c.wa_id} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-800 truncate">{c.name || `+${c.wa_id}`}</h2>
              <TierBadge tier={c.tier} auto={c.tier_auto} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              +{c.wa_id} {c.country && `· ${c.country}`} {c.company && `· ${c.company}`}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {c.brands.map((b) => (
                <Chip key={b} tone={c.brands_bought.includes(b) ? 'orange' : 'slate'}>{b}</Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-1.5">
            {canChat && onOpenInbox && (
              <Button size="sm" variant="ghost" onClick={() => onOpenInbox(c.conversation_id!)}>
                <MessageSquare className="w-3.5 h-3.5" /> Chats
              </Button>
            )}
            <a href={`https://wa.me/${c.wa_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-full text-xs px-3 py-1.5 font-medium bg-[#25D366] text-white">
              WhatsApp
            </a>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Mini label="Total spent" value={money(c.total_spent, undefined, true)} />
          <Mini label="Orders" value={String(c.order_count)} />
          <Mini label="Last order" value={c.last_order_at ? shortDate(c.last_order_at) : '—'} />
        </div>
        <div className="mt-4">
          <PillTabs value={tab} onChange={setTab} items={tabs} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'chat' &&
          (messages === null ? (
            <Loading />
          ) : messages.length ? (
            <>
              <div className="px-4 py-2 text-[11px] text-slate-500 bg-slate-50 border-b border-slate-100">Customer ↔ AI chat (view only).</div>
              <UnifiedMessageList messages={messages} events={events} party="customer" />
            </>
          ) : (
            <Empty title="No messages yet" />
          ))}
        {tab === 'orders' && (
          <div className="p-4 overflow-y-auto">
            {!orders ? (
              <Loading />
            ) : !orders.length ? (
              <Empty title="No orders yet" />
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.id} className="rounded-2xl border border-slate-200/70 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800">{o.order_no} <span className="text-slate-400 font-normal text-xs">· {dateTime(o.created_at)}</span></div>
                      <div className="text-xs text-slate-500 truncate">{o.items.map((i: any) => `${i.quantity}× ${i.description}`).join(', ')}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">{money(o.total)}</div>
                      <StatusDot color={ORDER_STATUS[o.status as keyof typeof ORDER_STATUS].color} label={ORDER_STATUS[o.status as keyof typeof ORDER_STATUS].label} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'details' && (
          <div className="p-5 overflow-y-auto space-y-3 text-sm">
            <Row k="Lead ID" v={c.lead_id} />
            <Row k="Payment tier" v={`${TIER_LABEL[c.tier]} ${c.tier_auto ? '(automatic, from total spent)' : '(set by hand)'}`} />
            <Row k="Delivery address" v={c.delivery_address} />
            <Row k="Payment method" v={c.payment_method} />
            {c.offer && (c.offer as any).Offer_Price && (
              <Row k="Latest offer" v={`${(c.offer as any).Offer_Currency || ''} ${(c.offer as any).Offer_Price} × ${(c.offer as any).Offer_Qty || ''} · ${(c.offer as any).Offer_Status || ''}`.trim()} />
            )}
            <Row k="Email" v={c.email} />
            <Row k="City" v={c.city} />
            <Row k="Language" v={c.preferred_language} />
            <Row k="Lead status" v={c.lead_status} />
            <Row k="Brands asked for" v={c.preferred_brands.join(', ')} />
            <Row k="Brands bought" v={c.brands_bought.join(', ')} />
            <Row k="Marketing" v={c.marketing_opt_in ? 'Receives broadcasts' : 'Opted out of broadcasts'} />
            <Row k="Notes" v={c.notes} />
            <Row k="Customer since" v={shortDate(c.created_at)} />
            <div className="pt-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">What they asked for</div>
              {!inquiries ? (
                <Loading />
              ) : !inquiries.length ? (
                <p className="text-xs text-slate-400">No product inquiries recorded.</p>
              ) : (
                <div className="space-y-1.5">
                  {inquiries.map((i) => (
                    <div key={i.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs flex flex-wrap justify-between gap-2">
                      <span className="text-slate-800">{[i.brand, i.model, i.storage, i.grade && `Grade ${i.grade}`, i.color].filter(Boolean).join(' ')}{i.quantity ? ` · ${i.quantity} pcs` : ''}</span>
                      <span className="text-slate-500">{i.quoted_price ? money(i.quoted_price) + ' · ' : ''}{shortDate(i.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {perms.has('customers.manage') && (
              <Button variant="light" onClick={() => setEditing(true)}>
                Edit record
              </Button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <CustomerModal
          customer={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      )}
    </Card>
  );
}

const Mini = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-slate-50 px-3 py-2">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className="text-sm font-semibold text-slate-800 truncate">{value}</div>
  </div>
);
const Row = ({ k, v }: { k: string; v: string | null | undefined }) => (
  <div className="flex gap-4">
    <span className="w-36 shrink-0 text-slate-500">{k}</span>
    <span className="text-slate-800 whitespace-pre-wrap">{v || '—'}</span>
  </div>
);

function CustomerModal({ customer, onClose, onSaved }: { customer?: CustomerView; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    wa_id: customer?.wa_id || '',
    name: customer?.name || '',
    company: customer?.company || '',
    email: customer?.email || '',
    country: customer?.country || '',
    city: customer?.city || '',
    payment_tier: customer?.payment_tier || '',
    preferred_brands: (customer?.preferred_brands || []).join(', '),
    notes: customer?.notes || '',
    marketing_opt_in: customer?.marketing_opt_in ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const save = async () => {
    setBusy(true);
    setErr(null);
    const body: Record<string, unknown> = {
      ...f,
      payment_tier: f.payment_tier || null,
      preferred_brands: f.preferred_brands.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (customer) delete body.wa_id;
    try {
      await api(customer ? `/api/biz/customers/${customer.id}` : '/api/biz/customers', { method: customer ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={customer ? 'Edit customer' : 'Add customer'} wide>
      <ErrorNote text={err} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!customer && <Field label="WhatsApp number" hint="With country code, e.g. 971501234567"><input className={inputCls} value={f.wa_id} onChange={set('wa_id')} /></Field>}
        <Field label="Name"><input className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Company"><input className={inputCls} value={f.company} onChange={set('company')} /></Field>
        <Field label="Email"><input className={inputCls} value={f.email} onChange={set('email')} /></Field>
        <Field label="Country"><input className={inputCls} value={f.country} onChange={set('country')} /></Field>
        <Field label="City"><input className={inputCls} value={f.city} onChange={set('city')} /></Field>
        <Field label="Payment tier" hint="Automatic uses total spent">
          <select className={inputCls} value={f.payment_tier} onChange={set('payment_tier')}>
            <option value="">Automatic</option>
            <option value="high">High paying</option>
            <option value="medium">Medium</option>
            <option value="low">Low paying</option>
          </select>
        </Field>
        <Field label="Brands asked for" hint="Comma separated"><input className={inputCls} value={f.preferred_brands} onChange={set('preferred_brands')} placeholder="Apple, Samsung" /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
          <input type="checkbox" checked={f.marketing_opt_in} onChange={set('marketing_opt_in')} className="accent-orange-500 w-4 h-4" /> Receives broadcasts
        </label>
        <div className="sm:col-span-2">
          <Field label="Notes"><textarea rows={3} className={inputCls} value={f.notes} onChange={set('notes')} /></Field>
        </div>
      </div>
      <div className="flex justify-end mt-5">
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
    </Modal>
  );
}

function Insights({ list, onBack }: { list: CustomerView[] | null; onBack: () => void }) {
  if (!list) return <Loading />;
  const count = (key: (c: CustomerView) => string[]) => {
    const m = new Map<string, number>();
    for (const c of list) for (const k of key(c)) m.set(k, (m.get(k) || 0) + 1);
    return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const fmt = (n: number) => String(Math.round(n));
  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-3.5 h-3.5" /> Customer list</Button>
        <ExportButton entity="customers" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card><CardTitle t="Customers by country" /><BarList rows={count((c) => [c.country || 'Unknown'])} format={fmt} /></Card>
        <Card><CardTitle t="Payment tier" /><BarList rows={count((c) => [TIER_LABEL[c.tier]])} format={fmt} tone="slate" /></Card>
        <Card><CardTitle t="Brands asked for or bought" /><BarList rows={count((c) => c.brands.length ? c.brands : ['None yet'])} format={fmt} /></Card>
        <Card><CardTitle t="Lead status" /><BarList rows={count((c) => [c.lead_status || 'Unknown'])} format={fmt} tone="slate" /></Card>
        <Card><CardTitle t="Top customers by spend" /><BarList rows={[...list].filter((c) => c.total_spent > 0).sort((a, b) => b.total_spent - a.total_spent).map((c) => ({ label: c.name || '+' + c.wa_id, value: c.total_spent, sub: `${c.order_count} orders` }))} format={(n) => money(n, undefined, true)} /></Card>
        <Card><CardTitle t="Language" /><BarList rows={count((c) => [c.preferred_language || 'Unknown'])} format={fmt} tone="slate" /></Card>
      </div>
    </div>
  );
}
const CardTitle = ({ t }: { t: string }) => <h3 className="text-[15px] font-semibold text-slate-800 mb-4">{t}</h3>;
