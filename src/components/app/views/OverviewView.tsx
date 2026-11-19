'use client';
import { DEFAULT_CURRENCY } from '@/lib/currency';
import React, { useEffect, useState } from 'react';
import { Banknote, Boxes, Package, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import type { InventoryAnalytics, SalesAnalytics } from '@/lib/biz/logic';
import { api, Card, CardHeader, cx, ErrorNote, Loading, money, num, PillTabs, shortDate, StatTile, StatusDot, Table, td } from '../ui';
import { BarList, ColumnChart, Meter } from '../charts';
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
    if (canOrders) api<{ orders: any[] }>('/api/biz/orders').then((d) => setOrders(d.orders.slice(0, 6))).catch(() => {});
  }, [canOrders]);

  const s = data?.sales;
  const inv = data?.inventory;

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-[30px] font-semibold tracking-tight text-slate-800">
            {greeting()}, {name.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Your sales, stock and customers at a glance.</p>
        </div>
        <PillTabs value={days} onChange={setDays} items={RANGES.map((r) => ({ id: r.id, label: r.label }))} />
      </div>
      <ErrorNote text={err} />
      {!data && !err && <Loading />}

      {s && (
        <div className={cx('grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-12 transition-opacity', loading && 'opacity-60')}>
          {/* Revenue card */}
          <Card className="xl:col-span-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total revenue</span>
                <span className="text-[11px] text-slate-500 rounded-full border border-slate-200 px-2 py-0.5">{DEFAULT_CURRENCY} · last {days} days</span>
              </div>
              <div className="text-3xl sm:text-[34px] font-semibold tracking-tight text-slate-800 mt-2">{money(s.revenue)}</div>
              <div className="text-xs text-slate-500 mt-1">
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
            <div className="grid grid-cols-2 gap-2 mt-5">
              {perms.has('orders.view') && (
                <button onClick={() => onOpen('orders')} className="rounded-full bg-slate-800 text-white text-sm py-2.5 hover:bg-slate-700">
                  View orders
                </button>
              )}
              {perms.has('broadcast.send') && (
                <button onClick={() => onOpen('broadcast')} className="rounded-full bg-slate-100 text-slate-800 text-sm py-2.5 hover:bg-slate-200">
                  New broadcast
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 rounded-2xl bg-slate-50 p-3">
              <MiniStat label="Pending" value={num(s.pendingOrders)} hint="orders" />
              <MiniStat label="Unpaid" value={money(s.unpaidValue, undefined, true)} hint="open value" />
              <MiniStat label="Avg order" value={money(s.avgOrder, undefined, true)} hint="per order" />
            </div>
          </Card>

          {/* 2×2 tiles */}
          <div className="xl:col-span-4 grid grid-cols-2 gap-3 md:col-span-2 xl:col-span-4">
            <StatTile highlight label="Gross profit" value={money(s.profit, undefined, true)} icon={TrendingUp} delta={{ now: s.profit, prev: s.profitPrev }} hint="this period" />
            <StatTile label="Orders" value={num(s.orders)} icon={ShoppingCart} delta={{ now: s.orders, prev: s.ordersPrev }} hint="this period" />
            <StatTile label="Units sold" value={num(s.unitsSold)} icon={Package} hint="phones" />
            <StatTile label="Stock value" value={inv ? money(inv.stockValueCost, undefined, true) : '—'} icon={Boxes} hint={inv ? `${num(inv.units)} units` : 'no access'} />
          </div>

          {/* Revenue chart */}
          <Card className="xl:col-span-4">
            <CardHeader title="Revenue" subtitle="Cost of goods + profit, per day" />
            <ColumnChart
              data={s.series.map((p) => ({ ...p, cost: Math.max(0, p.revenue - p.profit), profit: Math.max(0, p.profit) }))}
              xKey="label"
              series={[
                { key: 'cost', label: 'Cost', tone: 'slate' },
                { key: 'profit', label: 'Profit', tone: 'hatch' },
              ]}
              height={180}
            />
          </Card>

          {/* Stock health */}
          <div className="xl:col-span-4 flex flex-col gap-4">
            {inv && (
              <Card>
                <CardHeader title="Stock health" subtitle={`${inv.skus} active products`} right={<button onClick={() => onOpen('inventory')} className="text-xs text-slate-500 hover:text-slate-800">Open</button>} />
                <Meter
                  value={inv.skus - inv.lowStock.length}
                  max={inv.skus}
                  label={<><b className="text-slate-800">{inv.skus - inv.lowStock.length}</b> healthy</>}
                  right={<>{inv.lowStock.length} low · {inv.outOfStock} out</>}
                />
                {inv.lowStock.slice(0, 3).map((l) => (
                  <div key={l.product_id} className="flex items-center justify-between text-xs mt-3">
                    <span className="truncate text-slate-700">{l.brand} {l.name}</span>
                    <span className="shrink-0 text-rose-600 font-semibold">{l.stock} left</span>
                  </div>
                ))}
              </Card>
            )}
            <Card className="flex-1">
              <CardHeader title="Revenue by brand" />
              <BarList rows={s.byBrand.map((b) => ({ label: b.brand, value: b.revenue, sub: `${num(b.units)} pcs` }))} max={6} />
            </Card>
          </div>

          {/* Recent orders */}
          <Card className="md:col-span-2 xl:col-span-8">
            <CardHeader title="Recent orders" right={perms.has('orders.view') && <button onClick={() => onOpen('orders')} className="text-xs rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:text-slate-800">View all</button>} />
            {perms.has('orders.view') ? (
              <Table head={['Order ID', 'Customer', 'Items', 'Total', 'Status', 'Date']} minWidth={640}>
                {orders.map((o) => {
                  const st = ORDER_STATUS[o.status as keyof typeof ORDER_STATUS];
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

          <Card className="xl:col-span-4">
            <CardHeader title="Top products" subtitle="By revenue" />
            <BarList rows={s.topProducts.map((p) => ({ label: `${p.brand} ${p.name}`, value: p.revenue, sub: `${num(p.units)} pcs` }))} tone="slate" max={6} />
          </Card>
          <Card className="xl:col-span-4">
            <CardHeader title="Revenue by country" />
            <BarList rows={s.byCountry.map((c) => ({ label: c.country, value: c.revenue, sub: `${c.orders} orders` }))} max={6} />
          </Card>
          <Card className="xl:col-span-4">
            <CardHeader title="Top customers" />
            <BarList rows={s.topCustomers.map((c) => ({ label: c.name, value: c.revenue, sub: `${c.orders} orders` }))} tone="slate" max={5} />
          </Card>
          <Card className="xl:col-span-4">
            <CardHeader title="Where orders come from" />
            <div className="space-y-3">
              {s.bySource.map((x) => (
                <div key={x.source} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    {x.source === 'whatsapp_ai' ? <Wallet className="w-4 h-4 text-orange-500" /> : <Banknote className="w-4 h-4 text-slate-500" />}
                    {x.source === 'whatsapp_ai' ? 'WhatsApp AI agent' : x.source === 'broadcast' ? 'Broadcasts' : 'Dashboard'}
                  </span>
                  <span className="text-slate-800 font-semibold tabular-nums">
                    {x.count} <span className="text-slate-400 font-normal">· {money(x.revenue, undefined, true)}</span>
                  </span>
                </div>
              ))}
              {!s.bySource.length && <p className="text-xs text-slate-400">No orders in this period</p>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-800 truncate">{value}</div>
      <div className="text-[10px] text-slate-400">{hint}</div>
    </div>
  );
}
