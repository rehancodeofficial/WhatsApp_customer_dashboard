'use client';
import { DEFAULT_CURRENCY } from '@/lib/currency';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Order, OrderStatus } from '@/lib/biz/types';
import { ExportButton } from '../ExportButton';
import { BarList, ColumnChart } from '../charts';
import { api, Button, Card, Chip, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, money, PageHeader, PillTabs, SearchInput, StatusDot, Table, td } from '../ui';
import { contactLabel } from '@/lib/biz/channel';

export const ORDER_STATUS: Record<OrderStatus, { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'orange' }> = {
  pending: { label: 'Pending', color: 'amber' },
  confirmed: { label: 'Confirmed', color: 'blue' },
  paid: { label: 'Paid', color: 'orange' },
  shipped: { label: 'Shipped', color: 'blue' },
  delivered: { label: 'Delivered', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};
const PAY_TONE = { unpaid: 'red', partial: 'amber', paid: 'green', refunded: 'slate' } as const;

type Row = Order & { customer: { name: string | null; wa_id: string; country: string | null } | null };
interface PickCustomer { id: string; name: string | null; wa_id: string; country: string | null }
interface PickProduct { id: string; sku: string; brand: string; model: string; variant: string | null; sale_price: number; stock_qty: number; currency: string }

export function OrdersView({ perms }: { perms: Set<string> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [customers, setCustomers] = useState<PickCustomer[]>([]);
  const [products, setProducts] = useState<PickProduct[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'open' | 'unpaid' | 'done' | 'cancelled'>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);
  const canManage = perms.has('orders.manage');
  const canPay = perms.has('payments.manage') || canManage;

  const load = useCallback(() => {
    api<{ orders: Row[]; customers: PickCustomer[]; products: PickProduct[] }>('/api/biz/orders')
      .then((d) => {
        setRows(d.orders);
        setCustomers(d.customers);
        setProducts(d.products);
      })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((o) => {
      if (tab === 'open' && !['pending', 'confirmed', 'paid', 'shipped'].includes(o.status)) return false;
      if (tab === 'unpaid' && (o.payment_status === 'paid' || o.payment_status === 'refunded' || o.status === 'cancelled')) return false;
      if (tab === 'done' && o.status !== 'delivered') return false;
      if (tab === 'cancelled' && o.status !== 'cancelled') return false;
      if (!t) return true;
      return [o.order_no, o.customer?.name, o.customer?.wa_id, ...(o.items || []).map((i) => i.description)].some((v) => v && v.toLowerCase().includes(t));
    });
  }, [rows, tab, q]);

  const patch = async (o: Row, body: Record<string, string>) => {
    try {
      const { order } = await api<{ order: Order }>(`/api/biz/orders/${o.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setRows((r) => (r || []).map((x) => (x.id === o.id ? { ...x, ...order } : x)));
      setOpen((cur) => (cur && cur.id === o.id ? { ...cur, ...order } : cur));
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-1">
      <PageHeader
        title="Orders"
        subtitle="Every order from the WhatsApp AI agent and the dashboard."
        right={
          <>
            <ExportButton entity="orders" />
            {canManage && <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New order</Button>}
          </>
        }
      />
      <ErrorNote text={err} />
      {rows && rows.length > 0 && <OrderCharts rows={rows} />}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <PillTabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'all', label: 'All', count: rows?.length },
              { id: 'open', label: 'Open' },
              { id: 'unpaid', label: 'Unpaid' },
              { id: 'done', label: 'Delivered' },
              { id: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <SearchInput value={q} onChange={setQ} placeholder="Order, customer, product" />
        </div>
        {!rows ? (
          <Loading />
        ) : !filtered.length ? (
          <Empty title="No orders here" text="Orders created by the AI agent (via n8n) or from this page show up here." />
        ) : (
          <Table head={['Order ID', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Date', '']}>
            {filtered.slice(0, 300).map((o) => {
              const st = ORDER_STATUS[o.status];
              return (
                <tr key={o.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpen(o)}>
                  <td className={cx(td, 'font-medium text-slate-800 whitespace-nowrap')}>{o.order_no}</td>
                  <td className={td}>
                    <div className="text-slate-800">{o.customer?.name || (o.customer ? contactLabel(o.customer) : 'Walk-in')}</div>
                    {o.customer?.country && <div className="text-[11px] text-slate-400">{o.customer.country}</div>}
                  </td>
                  <td className={cx(td, 'text-slate-600 max-w-64 truncate')}>{(o.items || []).map((i) => `${i.quantity}× ${i.description}`).join(', ')}</td>
                  <td className={cx(td, 'tabular-nums font-medium whitespace-nowrap')}>{money(o.total, o.currency)}</td>
                  <td className={td}>
                    <Chip tone={PAY_TONE[o.payment_status]}>{o.payment_status}</Chip>
                  </td>
                  <td className={td}>
                    <StatusDot color={st.color} label={st.label} />
                  </td>
                  <td className={cx(td, 'text-slate-500 whitespace-nowrap')}>{dateTime(o.created_at)}</td>
                  <td className={cx(td, 'text-slate-400')}>•••</td>
                </tr>
              );
            })}
          </Table>
        )}
        {filtered.length > 300 && <p className="text-xs text-slate-400 mt-3">Showing the newest 300 of {filtered.length}. Use search to narrow down.</p>}
      </Card>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Order ${open.order_no}` : ''}>
        {open && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              {open.customer?.name || 'Walk-in'} {open.customer && <span className="text-slate-400">· {contactLabel(open.customer)}</span>}
              <div className="text-xs text-slate-400">{dateTime(open.created_at)} · source: {open.source.replace('_', ' ')}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {(open.items || []).map((i) => (
                <div key={i.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-slate-700">{i.quantity}× {i.description}</span>
                  <span className="tabular-nums text-slate-800">{money(i.line_total, open.currency)}</span>
                </div>
              ))}
              {open.discount > 0 && (
                <div className="flex justify-between px-4 py-2.5 text-sm text-slate-500">
                  <span>Discount</span>
                  <span>-{money(open.discount, open.currency)}</span>
                </div>
              )}
              <div className="flex justify-between px-4 py-2.5 text-sm font-semibold">
                <span>Total</span>
                <span>{money(open.total, open.currency)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select className={inputCls} value={open.status} disabled={!canManage || open.status === 'cancelled'} onChange={(e) => patch(open, { status: e.target.value })}>
                  {Object.entries(ORDER_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Payment">
                <select className={inputCls} value={open.payment_status} disabled={!canPay} onChange={(e) => patch(open, { payment_status: e.target.value })}>
                  {Object.keys(PAY_TONE).map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </Field>
            </div>
            {open.status !== 'cancelled' && canManage && <p className="text-[11px] text-slate-400">Cancelling an order puts its items back in stock.</p>}
            {open.notes && <p className="text-sm text-slate-600 whitespace-pre-wrap">{open.notes}</p>}
          </div>
        )}
      </Modal>

      {creating && (
        <NewOrderModal
          customers={customers}
          products={products}
          canPay={canPay}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewOrderModal({ customers, products, canPay, onClose, onDone }: { customers: PickCustomer[]; products: PickProduct[]; canPay: boolean; onClose: () => void; onDone: () => void }) {
  const [contactId, setContactId] = useState('');
  const [lines, setLines] = useState([{ product_id: products[0]?.id || '', quantity: 10, unit_price: products[0]?.sale_price || 0 }]);
  const [discount, setDiscount] = useState(0);
  const [status, setStatus] = useState<OrderStatus>('confirmed');
  const [payment, setPayment] = useState('unpaid');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const byId = new Map(products.map((p) => [p.id, p]));
  const subtotal = lines.reduce((a, l) => a + l.quantity * l.unit_price, 0);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/biz/orders', {
        method: 'POST',
        body: JSON.stringify({
          contact_id: contactId || null,
          status,
          payment_status: payment,
          discount,
          notes: notes || null,
          items: lines.map((l) => {
            const p = byId.get(l.product_id)!;
            return { product_id: l.product_id, description: `${p.brand} ${p.model} ${p.variant || ''}`.trim(), quantity: l.quantity, unit_price: l.unit_price };
          }),
        }),
      });
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New order" wide>
      <ErrorNote text={err} />
      <div className="space-y-4">
        <Field label="Customer">
          <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Walk-in / no customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name || contactLabel(c)}{c.country ? ` · ${c.country}` : ''}</option>
            ))}
          </select>
        </Field>
        <div className="space-y-2">
          <span className="block text-xs font-medium text-slate-600">Items</span>
          {lines.map((l, i) => {
            const p = byId.get(l.product_id);
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <select
                  className={cx(inputCls, 'col-span-12 sm:col-span-6')}
                  value={l.product_id}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, product_id: e.target.value, unit_price: byId.get(e.target.value)?.sale_price || 0 } : x)))}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.stock_qty <= 0}>
                      {p.brand} {p.model} {p.variant || ''} ({p.stock_qty} in stock)
                    </option>
                  ))}
                </select>
                <input type="number" min={1} max={p?.stock_qty} className={cx(inputCls, 'col-span-4 sm:col-span-2')} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} aria-label="Quantity" />
                <input type="number" min={0} className={cx(inputCls, 'col-span-6 sm:col-span-3')} value={l.unit_price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit_price: Math.max(0, Number(e.target.value) || 0) } : x)))} aria-label="Unit price" />
                <button className="col-span-2 sm:col-span-1 w-9 h-9 rounded-full hover:bg-rose-50 text-rose-500 flex items-center justify-center disabled:opacity-30" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
          <Button variant="light" size="sm" onClick={() => setLines([...lines, { product_id: products[0]?.id || '', quantity: 10, unit_price: products[0]?.sale_price || 0 }])}>
            <Plus className="w-3.5 h-3.5" /> Add item
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Discount ({DEFAULT_CURRENCY})">
            <input type="number" min={0} className={inputCls} value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
              {(['pending', 'confirmed', 'paid', 'shipped', 'delivered'] as OrderStatus[]).map((k) => (
                <option key={k} value={k}>{ORDER_STATUS[k].label}</option>
              ))}
            </select>
          </Field>
          <Field label="Payment">
            <select className={inputCls} value={payment} onChange={(e) => setPayment(e.target.value)} disabled={!canPay}>
              {['unpaid', 'partial', 'paid'].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-sm text-slate-600">
            Total <b className="text-slate-800 text-base ml-1">{money(Math.max(0, subtotal - discount))}</b>
          </div>
          <Button onClick={submit} loading={busy} disabled={!lines.length || !products.length}>Create order</Button>
        </div>
        <p className="text-[11px] text-slate-400">Stock is taken out of inventory when the order is created.</p>
      </div>
    </Modal>
  );
}

function OrderCharts({ rows }: { rows: Row[] }) {
  // Last 30 days: order value per day split into paid / not yet paid.
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000);
    return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), paid: 0, open: 0 };
  });
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const o of rows) {
    if (o.status === 'cancelled') continue;
    const d = byKey.get(o.created_at.slice(0, 10));
    if (!d) continue;
    if (o.payment_status === 'paid') d.paid += o.total;
    else d.open += o.total;
  }
  const status = new Map<string, number>();
  for (const o of rows) status.set(ORDER_STATUS[o.status].label, (status.get(ORDER_STATUS[o.status].label) || 0) + 1);
  return (
    <div className="grid gap-4 lg:grid-cols-3 mb-4">
      <Card className="lg:col-span-2">
        <h3 className="text-[15px] font-semibold text-slate-800">Order value, last 30 days</h3>
        <p className="text-xs text-slate-500 mb-3">Paid vs not yet paid</p>
        <ColumnChart data={days} xKey="label" series={[{ key: 'paid', label: 'Paid', tone: 'slate' }, { key: 'open', label: 'Not paid yet', tone: 'hatch' }]} height={170} />
      </Card>
      <Card>
        <h3 className="text-[15px] font-semibold text-slate-800 mb-4">Orders by status</h3>
        <BarList rows={Array.from(status, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} format={(n) => String(n)} />
      </Card>
    </div>
  );
}
