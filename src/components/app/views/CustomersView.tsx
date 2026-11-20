'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MessageSquare, Plus, ShoppingBag, ExternalLink, Calendar, MapPin, Mail, Phone, CreditCard, Tag } from 'lucide-react';
import type { CustomerView } from '@/lib/biz/types';
import { ExportButton } from '../ExportButton';
import { BarList } from '../charts';
import { api, Avatar, Button, Card, Chip, ChipSelect, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, money, PillTabs, SearchInput, shortDate, StatusDot, TierBadge, TIER_LABEL } from '../ui';
import { ORDER_STATUS } from './OrdersView';
import { contactLabel, isEmailOnly } from '@/lib/biz/channel';

type Tab = 'details' | 'orders';

export function CustomersView({
  perms,
  onOpenInbox,
  onOpenOrders,
}: {
  perms: Set<string>;
  onOpenInbox?: (conversationId: string) => void;
  onOpenOrders?: () => void;
}) {
  const [list, setList] = useState<CustomerView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tiers, setTiers] = useState<string[]>([]);
  const [country, setCountry] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'list' | 'insights'>('list');

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
    return [c.name, c.wa_id, c.email, c.company, c.country, ...c.brands].some((v) => v && v.toLowerCase().includes(t));
  });
  const current = list?.find((c) => c.id === sel) || null;

  if (view === 'insights') return <Insights list={list} onBack={() => setView('list')} />;

  return (
    <div className="h-full flex flex-col min-h-0 gap-3">
      {/* 1. TOP RECTANGLE BAR: Search, Country, Tiers, Insights, and Add Customer */}
      <Card className="p-3.5 sm:p-4 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left section: Title & Counters */}
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800">Customers</h2>
              <p className="text-[11px] text-slate-500">{list ? `${shown.length} of ${list.length} records` : 'Loading...'}</p>
            </div>
            <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
            {/* Search Input */}
            <div className="w-full sm:w-64">
              <SearchInput value={q} onChange={setQ} placeholder="Name, number, brand..." />
            </div>
          </div>

          {/* Right section: Filters (Country, Tier) & Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={cx(inputCls, 'rounded-full py-1.5 text-xs w-36')}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-label="Country"
            >
              <option value="all">All countries</option>
              {countries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>

            <ChipSelect
              options={['high', 'medium', 'low']}
              value={tiers}
              onChange={setTiers}
              render={(o) => (o === 'high' ? 'High' : o === 'medium' ? 'Mid' : 'Low')}
            />

            <Button size="sm" variant="ghost" onClick={() => setView('insights')}>
              Insights
            </Button>

            {perms.has('customers.manage') && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            )}
          </div>
        </div>
      </Card>

      <ErrorNote text={err} />

      {/* 2. MAIN BOTTOM SECTION: Left List + Right Customer Detail */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left: Customer List */}
        <Card className={cx('w-full lg:w-[360px] xl:w-[380px] shrink-0 flex flex-col min-h-0 p-3', current && 'hidden lg:flex')}>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
            {!list ? (
              <Loading />
            ) : !shown.length ? (
              <Empty title="No customers match" text="Try resetting search or filters." />
            ) : (
              shown.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSel(c.id)}
                  className={cx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors',
                    sel === c.id ? 'bg-orange-50 border border-orange-200/80 shadow-xs' : 'hover:bg-slate-50 border border-transparent'
                  )}
                >
                  <Avatar name={c.name || c.wa_id} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-semibold text-slate-800 truncate">{c.name || contactLabel(c)}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{c.last_order_at ? shortDate(c.last_order_at) : ''}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-xs text-slate-500 truncate">{c.country || 'Unknown country'} · {c.brands.slice(0, 2).join(', ') || 'no brands'}</span>
                      <TierBadge tier={c.tier} auto={c.tier_auto} />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Right: Customer Details (Without Chat Tab) */}
        <div className={cx('flex-1 min-w-0 min-h-0', !current && 'hidden lg:block')}>
          {current ? (
            <CustomerDetail
              key={current.id}
              c={current}
              perms={perms}
              onBack={() => setSel(null)}
              onSaved={load}
              onOpenInbox={onOpenInbox}
              onOpenOrders={onOpenOrders}
            />
          ) : (
            <Card className="h-full flex items-center justify-center text-center p-8">
              <Empty title="Pick a customer" text="Select a customer from the left list to view their full profile and order history." />
            </Card>
          )}
        </div>
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

function CustomerDetail({
  c,
  perms,
  onBack,
  onSaved,
  onOpenInbox,
  onOpenOrders,
}: {
  c: CustomerView;
  perms: Set<string>;
  onBack: () => void;
  onSaved: () => void;
  onOpenInbox?: (conversationId: string) => void;
  onOpenOrders?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('details');
  const [editing, setEditing] = useState(false);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [inquiries, setInquiries] = useState<any[] | null>(null);
  const canOrders = perms.has('orders.view');
  const canChat = perms.has('chats.view') && !!c.conversation_id;

  useEffect(() => {
    if (!orders && canOrders) {
      api<{ orders: any[] }>('/api/biz/orders')
        .then((d) => setOrders(d.orders.filter((o) => o.contact_id === c.id)))
        .catch(() => setOrders([]));
    }
    if (!inquiries) {
      api<{ inquiries: any[] }>(`/api/biz/customers/${c.id}`)
        .then((d) => setInquiries(d.inquiries))
        .catch(() => setInquiries([]));
    }
  }, [c, orders, canOrders, inquiries]);

  const tabs = [
    { id: 'details' as Tab, label: 'Details' },
    ...(perms.has('orders.view') ? [{ id: 'orders' as Tab, label: 'Orders', count: orders ? orders.length : c.order_count }] : []),
  ];

  return (
    <Card className="h-full flex flex-col min-h-0 p-0 overflow-hidden bg-white">
      {/* Customer Header Info */}
      <div className="p-4 sm:p-5 border-b border-slate-100 shrink-0">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="lg:hidden w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center shrink-0" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Avatar name={c.name || c.wa_id} size={50} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800 truncate">{c.name || contactLabel(c)}</h2>
              <TierBadge tier={c.tier} auto={c.tier_auto} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {contactLabel(c)} {isEmailOnly(c.wa_id) && '(email customer)'} {c.country && `· ${c.country}`} {c.company && `· ${c.company}`}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {c.brands.map((b) => (
                <Chip key={b} tone={c.brands_bought.includes(b) ? 'orange' : 'slate'}>{b}</Chip>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canChat && onOpenInbox && (
              <Button size="sm" variant="ghost" onClick={() => onOpenInbox(c.conversation_id!)}>
                <MessageSquare className="w-3.5 h-3.5" /> Chats
              </Button>
            )}
            {!isEmailOnly(c.wa_id) && (
            <a
              href={`https://wa.me/${c.wa_id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full text-xs px-3.5 py-1.5 font-semibold bg-[#25D366] text-white hover:bg-[#20ba59] transition-colors"
            >
              WhatsApp
            </a>
            )}
          </div>
        </div>

        {/* Top 3 Stat Cards */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Mini label="Total spent" value={money(c.total_spent, undefined, true)} />
          <Mini label="Orders" value={String(c.order_count)} />
          <Mini label="Last order" value={c.last_order_at ? shortDate(c.last_order_at) : '—'} />
        </div>

        {/* Tab pills: Only Details and Orders */}
        <div className="mt-4">
          <PillTabs value={tab} onChange={setTab} items={tabs} />
        </div>
      </div>

      {/* Body: Details or Orders */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'orders' && (
          <div className="p-5 space-y-3">
            {!orders ? (
              <Loading />
            ) : !orders.length ? (
              <Empty title="No orders yet" text="When this customer places an order, it will appear here." />
            ) : (
              <div className="space-y-2.5">
                {orders.map((o) => (
                  <div key={o.id} className="rounded-2xl border border-slate-200/80 p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">
                        {o.order_no} <span className="text-slate-400 font-normal text-xs">· {dateTime(o.created_at)}</span>
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {o.items.map((i: any) => `${i.quantity}× ${i.description}`).join(', ')}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold tabular-nums text-slate-900">{money(o.total)}</div>
                      <StatusDot color={ORDER_STATUS[o.status as keyof typeof ORDER_STATUS]?.color || 'gray'} label={ORDER_STATUS[o.status as keyof typeof ORDER_STATUS]?.label || o.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'details' && (
          <div className="p-5 space-y-5 text-sm">
            {/* Primary Profile Details */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer Profile</span>
                {perms.has('customers.manage') && (
                  <Button variant="light" size="sm" onClick={() => setEditing(true)}>
                    Edit record
                  </Button>
                )}
              </div>
              <Row k="Full name" v={c.name} />
              <Row k={isEmailOnly(c.wa_id) ? 'Contact' : 'WhatsApp number'} v={isEmailOnly(c.wa_id) ? `${contactLabel(c)} (came by email)` : `+${c.wa_id}`} />
              <Row k="Email address" v={c.email} />
              <Row k="Company" v={c.company} />
              <Row k="Country / City" v={[c.country, c.city].filter(Boolean).join(', ')} />
              <Row k="Delivery address" v={c.delivery_address} />
              <Row k="Preferred language" v={c.preferred_language?.toUpperCase()} />
              <Row k="Customer since" v={shortDate(c.created_at)} />
            </div>

            {/* Commercial & Terms */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-2xl p-4 space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block pb-2 border-b border-slate-200/60">
                Commercial & Lead Terms
              </span>
              <Row k="Lead ID" v={c.lead_id} />
              <Row k="Lead status" v={c.lead_status} />
              <Row k="Payment tier" v={`${TIER_LABEL[c.tier]} (${c.tier_auto ? 'automatic, from total spent' : 'manual override'})`} />
              <Row k="Payment method" v={c.payment_method} />
              <Row k="Last email ID" v={c.last_email_id} />
              <Row k="Marketing opt-in" v={c.marketing_opt_in ? 'Yes (receives broadcasts)' : 'No (opted out)'} />
            </div>

            {/* Inquiries Parity */}
            {inquiries && inquiries.length > 0 && (
              <div className="bg-slate-50/70 border border-slate-200/70 rounded-2xl p-4 space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block pb-2 border-b border-slate-200/60">
                  Recorded Inquiries ({inquiries.length})
                </span>
                <div className="space-y-2">
                  {inquiries.map((inq: any) => (
                    <div key={inq.id} className="text-xs bg-white p-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-slate-800">
                          {inq.brand} {inq.model} {inq.storage} ({inq.grade} Grade)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Qty: {inq.quantity || 1} · {shortDate(inq.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        {inq.quoted_price ? <div className="font-semibold text-slate-700">{money(inq.quoted_price)}</div> : null}
                        <span className="text-[10px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{inq.status || 'Recorded'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dedicated Order History Card */}
            <div className="bg-slate-50/70 border border-slate-200/70 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" /> Order History ({orders ? orders.length : c.order_count})
                </span>
                {perms.has('orders.view') && (
                  <Button variant="light" size="sm" onClick={() => setTab('orders')}>
                    View All Orders
                  </Button>
                )}
              </div>
              {!orders ? (
                <div className="text-xs text-slate-400 py-2">Loading customer orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">No orders placed by this customer yet.</div>
              ) : (
                <div className="space-y-2">
                  {orders.slice(0, 3).map((o) => (
                    <div key={o.id} className="text-xs bg-white p-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-slate-800">{o.order_no}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{o.items.map((i: any) => `${i.quantity}× ${i.description}`).join(', ')}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-slate-800">{money(o.total)}</div>
                        <div className="text-[10px] text-slate-400">{shortDate(o.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Internal Notes */}
            {c.notes && (
              <div className="bg-slate-50/70 border border-slate-200/70 rounded-2xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Notes & Inquiries</div>
                <p className="text-xs text-slate-600 whitespace-pre-wrap">{c.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <CustomerModal
          c={c}
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-3 min-w-0">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-base sm:text-lg font-bold text-slate-800 truncate mt-0.5">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs py-1 border-b border-slate-100 last:border-none">
      <span className="text-slate-500 font-medium">{k}</span>
      <span className="text-slate-800 font-semibold">{v || '—'}</span>
    </div>
  );
}

function CustomerModal({ c, onClose, onSaved }: { c?: CustomerView; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: c?.name || '',
    wa_id: c?.wa_id || '',
    email: c?.email || '',
    company: c?.company || '',
    country: c?.country || '',
    city: c?.city || '',
    delivery_address: c?.delivery_address || '',
    preferred_language: c?.preferred_language || 'en',
    notes: c?.notes || '',
    brands: (c?.brands || []).join(', '),
    payment_method: c?.payment_method || '',
    lead_status: c?.lead_status || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        name: f.name.trim() || null,
        wa_id: f.wa_id.replace(/[^0-9]/g, ''),
        email: f.email.trim() || null,
        company: f.company.trim() || null,
        country: f.country.trim() || null,
        city: f.city.trim() || null,
        delivery_address: f.delivery_address.trim() || null,
        preferred_language: f.preferred_language || 'en',
        notes: f.notes.trim() || null,
        brands: f.brands.split(',').map((b) => b.trim()).filter(Boolean),
        payment_method: f.payment_method.trim() || null,
        lead_status: f.lead_status.trim() || null,
      };
      await api(c ? `/api/biz/customers/${c.id}` : '/api/biz/customers', {
        method: c ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={c ? `Edit ${c.name || c.wa_id}` : 'New customer'}>
      <ErrorNote text={err} />
      <div className="space-y-3">
        <Field label="Full name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Zehra" /></Field>
        <Field label="WhatsApp number" hint="Digits with country code, no + or spaces"><input className={inputCls} value={f.wa_id} onChange={(e) => setF({ ...f, wa_id: e.target.value })} placeholder="923398039095" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email address"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Company"><input className={inputCls} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country"><input className={inputCls} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></Field>
          <Field label="City"><input className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        </div>
        <Field label="Delivery address"><input className={inputCls} value={f.delivery_address} onChange={(e) => setF({ ...f, delivery_address: e.target.value })} /></Field>
        <Field label="Preferred brands" hint="Comma-separated (e.g. Apple, Samsung)"><input className={inputCls} value={f.brands} onChange={(e) => setF({ ...f, brands: e.target.value })} /></Field>
        <Field label="Notes"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="light" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!f.wa_id.trim()}>Save customer</Button>
        </div>
      </div>
    </Modal>
  );
}

function Insights({ list, onBack }: { list: CustomerView[] | null; onBack: () => void }) {
  const safe = list || [];
  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of safe) m.set(c.country || 'Unknown', (m.get(c.country || 'Unknown') || 0) + 1);
    return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [safe]);

  const byBrand = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of safe) for (const b of c.brands) m.set(b, (m.get(b) || 0) + 1);
    return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [safe]);

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to list
        </button>
        <h2 className="text-base font-semibold text-slate-800">Customer Insights</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Customers by Country</h3>
          <BarList rows={byCountry} />
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Interest by Brand</h3>
          <BarList rows={byBrand} tone="slate" />
        </Card>
      </div>
    </div>
  );
}
