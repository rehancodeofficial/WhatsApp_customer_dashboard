'use client';
import { DEFAULT_CURRENCY } from '@/lib/currency';
import React, { useEffect, useState } from 'react';
import { ShoppingCart, TrendingUp, Boxes, Clock } from 'lucide-react';
import type { InventoryAnalytics, SalesAnalytics } from '@/lib/biz/logic';
import { api, Card, CardHeader, cx, ErrorNote, Loading, money, num, PillTabs, shortDate, StatusDot, Table, td } from '../ui';
import { LineGraph } from '../LineGraph';
import { ORDER_STATUS } from './OrdersView';
import { contactLabel } from '@/lib/biz/channel';

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

  // Line graph points for Country and Brand
  const countryLineData = (s?.byCountry || []).map((c) => ({
    label: c.country,
    value: c.revenue,
    sub: `${c.orders} orders`,
  }));

  const brandLineData = (s?.byBrand || []).map((b) => ({
    label: b.brand,
    value: b.revenue,
    sub: `${num(b.units)} pcs`,
  }));

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
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-2">{money(s.revenue, DEFAULT_CURRENCY)}</div>
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

          {/* 2. Gross profit & Pending Payments (Stacked into 2 cards in height-wise, same width) */}
          <div className="xl:col-span-3 flex flex-col gap-3 min-h-[170px] justify-between">
            {/* 2A. Gross profit Card (Orange Highlight) */}
            <div className="flex-1 bg-gradient-to-br from-orange-500 to-orange-600 rounded-3xl p-4 text-white flex flex-col justify-between shadow-md shadow-orange-500/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-orange-100">Gross profit</span>
                <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                  <TrendingUp className="w-3 h-3 text-white" />
                </span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {money(s.profit, undefined, true)}
                </div>
                <div className="text-[10px] text-orange-100/90 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-200"></span>
                  this period
                </div>
              </div>
            </div>

            {/* 2B. Pending Payments Card */}
            <div className="flex-1 bg-white rounded-3xl border border-slate-200/70 p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Pending payment</span>
                <span className="w-6 h-6 rounded-full bg-amber-50 border border-amber-200/70 flex items-center justify-center">
                  <Clock className="w-3 h-3 text-amber-600" />
                </span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  {money(s.unpaidValue, undefined, true)}
                </div>
                <div className="text-[10px] text-amber-600 font-medium">
                  unpaid
                </div>
              </div>
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
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{num(s.orders)}</span>
                <span className="text-[11px] text-slate-400 font-medium">total orders</span>
              </div>
              {/* Separate lines for Completed and Pending */}
              <div className="space-y-1 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Completed orders
                  </span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{paidOrdersList.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Pending orders
                  </span>
                  <span className="font-semibold text-amber-700 tabular-nums">{s.pendingOrders}</span>
                </div>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 mt-2">
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
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {inv ? money(inv.stockValueCost, undefined, true) : '—'}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">{inv ? `${num(inv.units)} units` : ''}</span>
              </div>
              {/* Owner critical metrics under stock value: Low stock & Out of stock alerts */}
              <div className="space-y-1 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    Active catalog
                  </span>
                  <span className="font-semibold text-slate-700 tabular-nums">{inv ? `${inv.skus} SKUs` : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <span className={cx("w-2 h-2 rounded-full", inv && (inv.lowStock.length > 0 || inv.outOfStock > 0) ? "bg-rose-500" : "bg-emerald-500")}></span>
                    Attention needed
                  </span>
                  <span className="font-semibold tabular-nums text-rose-600">
                    {inv ? (inv.lowStock.length === 0 && inv.outOfStock === 0 ? <span className="text-emerald-600">All healthy</span> : `${inv.lowStock.length} low · ${inv.outOfStock} out`) : '—'}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 mt-2">
              live inventory
            </div>
          </div>

          {/* 2 Line Graphs Side by Side: Sales by Country & Sales by Brand */}
          <Card className="xl:col-span-6 flex flex-col justify-between">
            <CardHeader
              title="Sales by Country"
              subtitle="Revenue breakdown & destination trend"
              right={
                countryLineData.length > 0 && (
                  <span className="text-xs font-semibold text-slate-700 bg-slate-100 rounded-full px-2.5 py-1">
                    {money(countryLineData.reduce((acc, c) => acc + c.value, 0), undefined, true)}
                  </span>
                )
              }
            />
            <div className="mt-2">
              <LineGraph
                data={countryLineData}
                strokeColor="#f97316"
                valuePrefix={`${DEFAULT_CURRENCY} `}
                height={150}
              />
            </div>
          </Card>

          <Card className="xl:col-span-6 flex flex-col justify-between">
            <CardHeader
              title="Sales by Brand"
              subtitle="Revenue contribution by manufacturer"
              right={
                brandLineData.length > 0 && (
                  <span className="text-xs font-semibold text-slate-700 bg-slate-100 rounded-full px-2.5 py-1">
                    {money(brandLineData.reduce((acc, b) => acc + b.value, 0), undefined, true)}
                  </span>
                )
              }
            />
            <div className="mt-2">
              <LineGraph
                data={brandLineData}
                strokeColor="#0f172a"
                valuePrefix={`${DEFAULT_CURRENCY} `}
                height={150}
              />
            </div>
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
                      <td className={td}>{o.customer?.name || (o.customer ? contactLabel(o.customer) : '—')}</td>
                      <td className={cx(td, 'text-slate-600 max-w-56 truncate')}>{(o.items || []).map((i: any) => `${i.quantity}× ${i.description}`).join(', ')}</td>
                      <td className={cx(td, 'tabular-nums font-medium')}>{money(o.total, o.currency)}</td>
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
