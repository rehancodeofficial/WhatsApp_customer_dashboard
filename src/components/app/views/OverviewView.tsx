'use client';
import { DEFAULT_CURRENCY } from '@/lib/currency';
import React, { useEffect, useState } from 'react';
import { ShoppingCart, TrendingUp, Package, Boxes, Clock } from 'lucide-react';
import type { InventoryAnalytics, SalesAnalytics } from '@/lib/biz/logic';
import { api, Card, CardHeader, cx, ErrorNote, Loading, money, num, PillTabs, shortDate, StatusDot, Table, td } from '../ui';
import { BarList } from '../charts';
import { ORDER_STATUS } from './OrdersView';

const RANGES = [
  { id: '7', label: '7D' },
  { id: '30', label: '30D' },
  { id: '90', label: '90D' },
  { id: '365', label: '1Y' },
] as const;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function OverviewView({ name, perms, onOpen }: { name: string; perms: Set<string>; onOpen: (section: 'orders' | 'inventory' | 'broadcast') => void }) {
  const [days, setDays] = useState<(typeof RANGES)[number]['id']>('30');
  const [data, setData] = useState<{ sales?: SalesAnalytics; inventory?: InventoryAnalytics } | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<{ sales?: SalesAnalytics; inventory?: InventoryAnalytics }>(`/api/analytics?days=${days}`)
      .then((d) => {
        setData(d);
        setErr(null);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  const canOrders = perms.has('orders.view');
  useEffect(() => {
    if (canOrders) {
      api<{ orders: any[] }>('/api/biz/orders')
        .then((d) => {
          setOrders(d.orders || []);
        })
        .catch(() => {});
    }
  }, [canOrders]);

  const s = data?.sales;
  const inv = data?.inventory;

  // Filter pending orders for the dedicated pending orders display
  const pendingOrdersList = orders.filter((o) => o.status === 'pending');
  const paidOrdersList = orders.filter((o) => o.status === 'paid' || o.payment_status === 'paid');
  const displayedOrders = pendingOrdersList.length > 0 ? pendingOrdersList : orders.slice(0, 6);

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-[30px] font-semibold tracking-tight text-slate-800">
            {greeting()}, {name.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Your sales and orders overview.</p>
        </div>
        <PillTabs value={days} onChange={setDays} items={RANGES.map((r) => ({ id: r.id, label: r.label }))} />
      </div>
      <ErrorNote text={err} />
      {!data && !err && <Loading />}

      {s && (
        <div className={cx('grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-12 transition-opacity', loading && 'opacity-60')}>
          {/* 1. Total revenue Card */}
          <div className="xl:col-span-3 bg-white rounded-3xl border border-slate-200/70 p-5 flex flex-col justify-between min-h-[170px]">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-slate-600 font-medium">Total revenue</span>
                <span className="text-[10px] text-slate-500 rounded-full border border-slate-200 px-2 py-0.5">{DEFAULT_CURRENCY} · last {days} days</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2">{money(s.revenue)}</div>
              <div className="text-[11px] text-slate-400 mt-1">
                {s.revenuePrev ? (
                  <>
                    <span className={s.revenue >= s.revenuePrev ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                      {s.revenue >= s.revenuePrev ? '↑' : '↓'} {Math.abs(((s.revenue - s.revenuePrev) / s.revenuePrev) * 100).toFixed(0)}%
                    </span>{' '}
                    vs previous {days} days
                  </>
                ) : (
                  'No sales in the previous period'
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {perms.has('orders.view') && (
                <button onClick={() => onOpen('orders')} className="rounded-full bg-slate-900 text-white text-xs font-semibold py-2 hover:bg-slate-800 transition-colors">
                  View orders
                </button>
              )}
              {perms.has('broadcast.send') && (
                <button onClick={() => onOpen('broadcast')} className="rounded-full bg-slate-100 text-slate-700 text-xs font-semibold py-2 hover:bg-slate-200 transition-colors">
                  New broadcast
                </button>
              )}
            </div>
          </div>

          {/* 2. Gross profit Card (Orange Highlight) */}
          <div className="xl:col-span-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-3xl p-5 text-white flex flex-col justify-between shadow-lg shadow-orange-500/20 min-h-[170px]">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-medium text-orange-100">Gross profit</span>
                <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-white" />
                </span>
              </div>
              {s.unpaidValue > 0 && (
                <div className="text-[11px] text-orange-200/90 font-medium mt-1">
                  pending payment: {money(s.unpaidValue, undefined, true)}
                </div>
              )}
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
                {money(s.profit, undefined, true)}
              </div>
            </div>
            <div className="text-[11px] text-orange-100/90 flex items-center gap-1.5 mt-3">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-200"></span>
              this period
            </div>
          </div>

          {/* 3. Orders Card */}
          <div className="xl:col-span-3 bg-white rounded-3xl border border-slate-200/70 p-5 flex flex-col justify-between min-h-[170px]">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-slate-600 font-medium">Orders</span>
                <span className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center">
                  <ShoppingCart className="w-3.5 h-3.5 text-slate-600" />
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] mt-1.5 text-slate-500">
                <span className="text-emerald-600 font-medium">{paidOrdersList.length} paid</span>
                <span>·</span>
                <span className="text-amber-600 font-medium">{s.pendingOrders} pending</span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{num(s.orders)}</span>
                <span className="text-[11px] text-slate-400 font-medium">total</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mt-3">
              this period
            </div>
          </div>

          {/* 4. Stock value Card */}
          <div className="xl:col-span-3 bg-white rounded-3xl border border-slate-200/70 p-5 flex flex-col justify-between min-h-[170px]">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-slate-600 font-medium">Stock value</span>
                <span className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center">
                  <Boxes className="w-3.5 h-3.5 text-slate-600" />
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2">
                {inv ? money(inv.stockValueCost, undefined, true) : '—'}
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mt-3">
              {inv ? `${num(inv.units)} units` : 'no access'}
            </div>
          </div>

          {/* 2 Graphs Side by Side: Sales by Country & Sales by Brand */}
          <Card className="xl:col-span-6">
            <CardHeader title="Sales by Country" subtitle="Revenue breakdown by destination" />
            <BarList rows={s.byCountry.map((c) => ({ label: c.country, value: c.revenue, sub: `${c.orders} orders` }))} max={6} />
          </Card>

          <Card className="xl:col-span-6">
            <CardHeader title="Sales by Brand" subtitle="Revenue contribution by manufacturer" />
            <BarList rows={s.byBrand.map((b) => ({ label: b.brand, value: b.revenue, sub: `${num(b.units)} pcs` }))} tone="slate" max={6} />
          </Card>

          {/* Pending Orders Card */}
          <Card className="xl:col-span-12">
            <CardHeader
              title={pendingOrdersList.length > 0 ? "Pending Orders" : "Recent Orders"}
              subtitle={pendingOrdersList.length > 0 ? `${pendingOrdersList.length} orders awaiting processing` : "Latest order activity"}
              right={
                perms.has('orders.view') && (
                  <button onClick={() => onOpen('orders')} className="text-xs rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:text-slate-800 flex items-center gap-1 font-medium transition-colors">
                    <Clock className="w-3.5 h-3.5 text-amber-500" /> View all in Orders
                  </button>
                )
              }
            />
            {perms.has('orders.view') ? (
              <Table head={['Order ID', 'Customer', 'Items', 'Total', 'Status', 'Date']} minWidth={640}>
                {displayedOrders.map((o) => {
                  const st = ORDER_STATUS[o.status as keyof typeof ORDER_STATUS] || { label: o.status, color: 'gray' };
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/60">
                      <td className={cx(td, 'font-medium text-slate-800')}>{o.order_no}</td>
                      <td className={td}>{o.customer?.name || (o.customer ? `+${o.customer.wa_id}` : '—')}</td>
                      <td className={cx(td, 'text-slate-600 max-w-56 truncate')}>{(o.items || []).map((i: any) => `${i.quantity}× ${i.description}`).join(', ')}</td>
                      <td className={cx(td, 'tabular-nums font-medium')}>{money(o.total)}</td>
                      <td className={td}>
                        <StatusDot color={st.color} label={st.label} />
                      </td>
                      <td className={cx(td, 'text-slate-500 whitespace-nowrap')}>{shortDate(o.created_at)}</td>
                    </tr>
                  );
                })}
              </Table>
            ) : (
              <p className="text-xs text-slate-400">You do not have access to orders.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
