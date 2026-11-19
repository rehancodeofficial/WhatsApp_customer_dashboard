'use client';
// Supplier price requests (Supplier_Requests), their quotes (Supplier_Quotes) and demands (Supplier_Demands).
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Trophy } from 'lucide-react';
import type { SupplierDemand, SupplierQuote, SupplierRequest } from '@/lib/biz/types';
import { api, Card, CardHeader, Chip, cx, dateTime, Empty, ErrorNote, Loading, money, num, PageHeader, PillTabs, SearchInput, StatTile, Table, td } from '../ui';
import { BarList } from '../charts';
import { ExportButton } from '../ExportButton';

const tone = (s: string | null) => {
  const t = (s || '').toLowerCase();
  if (/select|complete|deliver|accept|confirm/.test(t)) return 'green' as const;
  if (/expire|cancel|reject|not selected|fail/.test(t)) return 'red' as const;
  if (/repl|received|quoted/.test(t)) return 'orange' as const;
  return 'amber' as const;
};

export function SourcingView() {
  const [data, setData] = useState<{ requests: SupplierRequest[]; quotes: SupplierQuote[]; demands: SupplierDemand[]; products: { sku: string; name: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'requests' | 'quotes' | 'demands'>('requests');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<any>('/api/sourcing').then(setData).catch((e) => setErr(e.message));
  }, []);

  const quotesBy = useMemo(() => {
    const m = new Map<string, SupplierQuote[]>();
    for (const x of data?.quotes || []) m.set(x.request_code || '', [...(m.get(x.request_code || '') || []), x]);
    return m;
  }, [data]);
  const productName = new Map((data?.products || []).map((p) => [p.sku, p.name]));
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());

  const statusRows = (rows: { status: string | null }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.status || 'Unknown', (m.get(r.status || 'Unknown') || 0) + 1);
    return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const replied = (data?.quotes || []).filter((x) => x.price_per_unit);
  const bySupplier = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of data?.quotes || []) m.set(x.supplier_name || x.supplier_code || '—', (m.get(x.supplier_name || x.supplier_code || '—') || 0) + 1);
    return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [data]);

  return (
    <div className="h-full overflow-y-auto pr-1">
      <PageHeader
        title="Supplier Requests"
        subtitle="When a customer asks for something not in stock, the AI asks suppliers for prices. Requests, quotes and demands from n8n."
        right={<ExportButton entity="sourcing" />}
      />
      <ErrorNote text={err} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatTile highlight label="Open requests" value={num(data.requests.filter((r) => tone(r.status) === 'amber' || tone(r.status) === 'orange').length)} hint={`${data.requests.length} total`} />
            <StatTile label="Quotes" value={num(data.quotes.length)} hint={`${replied.length} with a price`} />
            <StatTile label="Reply rate" value={data.quotes.length ? `${Math.round((replied.length / data.quotes.length) * 100)}%` : '—'} hint="suppliers who quoted" />
            <StatTile label="Demands" value={num(data.demands.length)} hint="stock to buy" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Card>
              <CardHeader title="Requests by status" />
              <BarList rows={statusRows(data.requests)} format={num} tone="slate" />
            </Card>
            <Card>
              <CardHeader title="Quotes by supplier" />
              <BarList rows={bySupplier} format={num} />
            </Card>
          </div>
          <Card>
            <div className="flex flex-col lg:flex-row gap-3 justify-between mb-4">
              <PillTabs value={tab} onChange={setTab} items={[{ id: 'requests', label: 'Requests', count: data.requests.length }, { id: 'quotes', label: 'Quotes', count: data.quotes.length }, { id: 'demands', label: 'Demands', count: data.demands.length }]} />
              <SearchInput value={q} onChange={setQ} placeholder="Request ID, product, supplier" />
            </div>
            {tab === 'requests' &&
              (!data.requests.length ? (
                <Empty title="No supplier requests yet" />
              ) : (
                <Table head={['', 'Request', 'Customer', 'Product', 'Qty', 'Quotes', 'Best price', 'Status', 'Date']} minWidth={900}>
                  {data.requests
                    .filter((r) => match(`${r.request_code} ${r.customer_name} ${r.brand} ${r.model}`))
                    .map((r) => {
                      const qs = quotesBy.get(r.request_code) || [];
                      const priced = qs.filter((x) => x.price_per_unit).sort((a, b) => (a.price_per_unit || 0) - (b.price_per_unit || 0));
                      const isOpen = open === r.id;
                      return (
                        <React.Fragment key={r.id}>
                          <tr className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpen(isOpen ? null : r.id)}>
                            <td className={cx(td, 'w-8 text-slate-400')}>{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                            <td className={cx(td, 'font-mono text-xs')}>{r.request_code}</td>
                            <td className={td}>
                              <div>{r.customer_name || '—'}</div>
                              <div className="text-[11px] text-slate-400">{r.customer_market}</div>
                            </td>
                            <td className={td}>{[r.brand, r.model, r.storage, r.grade && `Grade ${r.grade}`, r.color].filter(Boolean).join(' ')}</td>
                            <td className={cx(td, 'tabular-nums')}>{r.quantity ?? '—'}</td>
                            <td className={cx(td, 'tabular-nums')}>{qs.length}</td>
                            <td className={cx(td, 'tabular-nums')}>{priced[0] ? money(priced[0].price_per_unit!, priced[0].currency || undefined) : '—'}</td>
                            <td className={td}><Chip tone={tone(r.status)}>{r.status || '—'}</Chip></td>
                            <td className={cx(td, 'text-slate-500 whitespace-nowrap')}>{dateTime(r.request_date || r.created_at)}</td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={9} className="bg-slate-50/70 px-4 py-3">
                                {!qs.length ? (
                                  <p className="text-xs text-slate-500">No supplier contacted yet.</p>
                                ) : (
                                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {qs.map((x) => (
                                      <div key={x.id} className={cx('rounded-2xl bg-white border p-3', x.id === priced[0]?.id ? 'border-orange-300' : 'border-slate-200')}>
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-sm font-semibold text-slate-800 truncate">{x.supplier_name || x.supplier_code}</span>
                                          {x.id === priced[0]?.id && <span className="inline-flex items-center gap-1 text-[11px] text-orange-700"><Trophy className="w-3 h-3" /> Best</span>}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">{x.status} · sent {dateTime(x.sent_at)}</div>
                                        <div className="text-sm mt-2">
                                          {x.price_per_unit ? <b>{money(x.price_per_unit, x.currency || undefined)}</b> : <span className="text-slate-400">No price yet</span>}
                                          {x.available_qty ? <span className="text-slate-500"> · {x.available_qty} pcs</span> : null}
                                          {x.delivery_days ? <span className="text-slate-500"> · {x.delivery_days} days</span> : null}
                                        </div>
                                        {x.supplier_reply && <p className="text-xs text-slate-600 mt-1.5 whitespace-pre-wrap line-clamp-4">{x.supplier_reply}</p>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                </Table>
              ))}
            {tab === 'quotes' && (
              <Table head={['Quote', 'Request', 'Supplier', 'Product', 'Asked', 'Price', 'Available', 'Delivery', 'Status', 'Replied']} minWidth={1000}>
                {data.quotes
                  .filter((x) => match(`${x.quote_code} ${x.request_code} ${x.supplier_name} ${x.brand} ${x.model}`))
                  .map((x) => (
                    <tr key={x.id}>
                      <td className={cx(td, 'font-mono text-xs')}>{x.quote_code}</td>
                      <td className={cx(td, 'font-mono text-xs')}>{x.request_code}</td>
                      <td className={td}>{x.supplier_name || x.supplier_code}</td>
                      <td className={td}>{[x.brand, x.model, x.storage, x.grade].filter(Boolean).join(' ')}</td>
                      <td className={cx(td, 'tabular-nums')}>{x.requested_qty ?? '—'}</td>
                      <td className={cx(td, 'tabular-nums')}>{x.price_per_unit ? money(x.price_per_unit, x.currency || undefined) : '—'}</td>
                      <td className={cx(td, 'tabular-nums')}>{x.available_qty ?? '—'}</td>
                      <td className={td}>{x.delivery_days ? `${x.delivery_days} days` : '—'}</td>
                      <td className={td}><Chip tone={tone(x.status)}>{x.status || '—'}</Chip></td>
                      <td className={cx(td, 'text-slate-500 whitespace-nowrap')}>{dateTime(x.replied_at)}</td>
                    </tr>
                  ))}
              </Table>
            )}
            {tab === 'demands' && (
              <Table head={['Demand', 'Product', 'Supplier', 'Qty', 'Expected price', 'Offered price', 'Delivery to', 'Status', 'Date']} minWidth={900}>
                {data.demands
                  .filter((x) => match(`${x.demand_code} ${x.product_code} ${productName.get(x.product_code || '')} ${x.notes}`))
                  .map((x) => (
                    <tr key={x.id}>
                      <td className={cx(td, 'font-mono text-xs')}>{x.demand_code}</td>
                      <td className={td}>
                        <div>{productName.get(x.product_code || '') || x.product_code || '—'}</div>
                        {x.notes && <div className="text-[11px] text-slate-400 max-w-64 truncate">{x.notes}</div>}
                      </td>
                      <td className={td}>{x.supplier_code || '—'}</td>
                      <td className={cx(td, 'tabular-nums')}>{x.requested_quantity ?? '—'}</td>
                      <td className={cx(td, 'tabular-nums')}>{x.expected_unit_price ? money(x.expected_unit_price) : '—'}</td>
                      <td className={cx(td, 'tabular-nums')}>{x.offered_unit_price ? money(x.offered_unit_price) : '—'}</td>
                      <td className={td}>{x.delivery_location || '—'}</td>
                      <td className={td}><Chip tone={tone(x.status)}>{x.status || '—'}</Chip></td>
                      <td className={cx(td, 'text-slate-500 whitespace-nowrap')}>{dateTime(x.demand_date || x.created_at)}</td>
                    </tr>
                  ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
