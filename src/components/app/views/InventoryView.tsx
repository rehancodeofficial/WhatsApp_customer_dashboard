'use client';
import { INVENTORY_CURRENCY } from '@/lib/currency';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, Package, PackagePlus, Pencil, Plus, Wallet } from 'lucide-react';
import type { InventoryAnalytics } from '@/lib/biz/logic';
import type { InventoryMovement, Product } from '@/lib/biz/types';
import { api, Button, Card, CardHeader, Chip, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, money, num, PageHeader, PillTabs, SearchInput, StatTile, StatusDot, Table, td } from '../ui';
import { BarList, ColumnChart } from '../charts';
import { ExportButton } from '../ExportButton';

type Tab = 'stock' | 'log' | 'analytics';
const MOVE_LABEL: Record<InventoryMovement['type'], string> = { in: 'Stock in', out: 'Sold / out', adjustment: 'Adjustment', return: 'Return' };

export function InventoryView({ perms }: { perms: Set<string> }) {
  const [tab, setTab] = useState<Tab>('stock');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[] | null>(null);
  const [analytics, setAnalytics] = useState<InventoryAnalytics | null>(null);
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Product | 'new' | null>(null);
  const [move, setMove] = useState<Product | null>(null);
  const canManage = perms.has('inventory.manage');

  const load = useCallback(() => {
    api<{ products: Product[]; suppliers: { id: string; name: string }[] }>('/api/biz/products')
      .then((d) => {
        setProducts(d.products);
        setSuppliers(d.suppliers);
      })
      .catch((e) => setErr(e.message));
    api<{ movements: InventoryMovement[] }>('/api/biz/inventory').then((d) => setMovements(d.movements)).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    api<{ inventory: InventoryAnalytics }>(`/api/analytics?kind=inventory&days=${days}`).then((d) => setAnalytics(d.inventory)).catch((e) => setErr(e.message));
  }, [days, products]);

  return (
    <div className="h-full overflow-y-auto pr-1">
      <PageHeader
        title="Inventory"
        subtitle="Stock records, movement log and analytics. Replaces the Inventory sheet."
        right={
          <>
            <PillTabs
              value={tab}
              onChange={setTab}
              items={[
                { id: 'stock', label: 'Stock records', count: products?.length },
                { id: 'log', label: 'Movement log' },
                { id: 'analytics', label: 'Analytics' },
              ]}
            />
            <ExportButton entity="inventory" />
            {canManage && (
              <Button onClick={() => setEdit('new')}>
                <Plus className="w-4 h-4" /> Add product
              </Button>
            )}
          </>
        }
      />
      <ErrorNote text={err} />
      {tab === 'analytics' && <Analytics a={analytics} days={days} setDays={setDays} />}
      {tab === 'stock' && <StockTable products={products} suppliers={suppliers} canManage={canManage} onEdit={setEdit} onMove={setMove} />}
      {tab === 'log' && <MovementLog movements={movements} products={products || []} />}

      {edit && (
        <ProductModal
          product={edit === 'new' ? null : edit}
          suppliers={suppliers}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
      {move && (
        <MovementModal
          product={move}
          onClose={() => setMove(null)}
          onSaved={() => {
            setMove(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Analytics({ a, days, setDays }: { a: InventoryAnalytics | null; days: '7' | '30' | '90'; setDays: (d: '7' | '30' | '90') => void }) {
  if (!a) return <Loading />;
  const slow = a.velocity.filter((v) => v.stock > 0).sort((x, y) => (y.daysLeft ?? 9999) - (x.daysLeft ?? 9999)).slice(0, 6);
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
      <div className="lg:col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile highlight label="Stock value (cost)" value={money(a.stockValueCost, undefined, true)} icon={Wallet} hint={`${money(a.stockValueSale, undefined, true)} at sale price`} />
        <StatTile label="Units in stock" value={num(a.units)} icon={Boxes} hint={`${a.skus} products`} />
        <StatTile label="Low stock" value={num(a.lowStock.length)} icon={AlertTriangle} hint="at or below reorder level" />
        <StatTile label="Movements" value={num(a.movementsInRange)} icon={Package} hint={`last ${days} days`} />
      </div>
      <Card className="lg:col-span-8">
        <CardHeader title="Stock in vs out" subtitle="Units per day" right={<PillTabs value={days} onChange={setDays} items={[{ id: '7', label: '7D' }, { id: '30', label: '30D' }, { id: '90', label: '90D' }]} />} />
        <ColumnChart
          data={a.flow}
          xKey="label"
          mode="group"
          series={[
            { key: 'in', label: 'In', tone: 'slate' },
            { key: 'out', label: 'Out', tone: 'hatch' },
          ]}
          height={220}
        />
      </Card>
      <Card className="lg:col-span-4">
        <CardHeader title="Stock value by brand" subtitle="At cost" />
        <BarList rows={a.byBrand.map((b) => ({ label: b.brand, value: b.value, sub: `${num(b.units)} pcs` }))} />
      </Card>
      <Card className="lg:col-span-6">
        <CardHeader title="Fast movers" subtitle={`Units sold, last ${days} days`} />
        <BarList rows={a.velocity.filter((v) => v.sold > 0).map((v) => ({ label: `${v.brand} ${v.name}`, value: v.sold, sub: v.daysLeft !== null ? `${v.daysLeft}d of stock` : undefined }))} format={num} tone="slate" max={6} />
      </Card>
      <Card className="lg:col-span-6">
        <CardHeader title="Slow movers" subtitle="Most days of stock left — candidates for a broadcast" />
        <Table head={['Product', 'Stock', 'Sold', 'Days left']} minWidth={420}>
          {slow.map((v) => (
            <tr key={v.product_id}>
              <td className={td}>{v.brand} {v.name}</td>
              <td className={cx(td, 'tabular-nums')}>{num(v.stock)}</td>
              <td className={cx(td, 'tabular-nums')}>{num(v.sold)}</td>
              <td className={td}>{v.daysLeft === null ? <Chip tone="red">no sales</Chip> : v.daysLeft > 90 ? <Chip tone="amber">{v.daysLeft}d</Chip> : `${v.daysLeft}d`}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {a.lowStock.length > 0 && (
        <Card className="lg:col-span-12">
          <CardHeader title="Reorder soon" subtitle="At or below the reorder level" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {a.lowStock.map((l) => (
              <div key={l.product_id} className="rounded-2xl bg-rose-50/60 border border-rose-100 p-3">
                <div className="text-sm text-slate-800 font-medium truncate">{l.brand} {l.name}</div>
                <div className="text-xs text-rose-700 mt-1">{l.stock} left · reorder at {l.reorder}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function StockTable({ products, suppliers, canManage, onEdit, onMove }: { products: Product[] | null; suppliers: { id: string; name: string }[]; canManage: boolean; onEdit: (p: Product) => void; onMove: (p: Product) => void }) {
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('all');
  const [country, setCountry] = useState('all');
  const [grade, setGrade] = useState('all');
  const [storage, setStorage] = useState('all');
  const [stock, setStock] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const sup = new Map(suppliers.map((s) => [s.id, s.name]));
  const list = products || [];
  const uniq = (vals: (string | null | undefined)[]) =>
    Array.from(new Set(vals.map((v) => (v || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  // Market_Region is a list ("UAE, Pakistan, ..."): the countries this product may be sold to.
  const countriesOf = (p: Product) => (p.market_region || '').split(/[,;/|]+/).map((c) => c.trim()).filter(Boolean);
  const brands = useMemo(() => uniq(list.map((p) => p.brand)), [products]);
  const countries = useMemo(() => uniq(list.flatMap(countriesOf)), [products]);
  const grades = useMemo(() => uniq(list.map((p) => p.grade || p.condition)), [products]);
  const storages = useMemo(() => uniq(list.map((p) => p.storage)), [products]);
  const avail = (p: Product) => p.stock_qty - (p.reserved_qty || 0);
  const rows = list
    .filter((p) => {
      if (brand !== 'all' && p.brand !== brand) return false;
      if (country !== 'all' && !countriesOf(p).some((c) => c.toLowerCase() === country.toLowerCase())) return false;
      if (grade !== 'all' && (p.grade || p.condition) !== grade) return false;
      if (storage !== 'all' && (p.storage || '') !== storage) return false;
      if (stock === 'in' && !(p.active && avail(p) > 0)) return false;
      if (stock === 'out' && !(avail(p) <= 0 || !p.active)) return false;
      if (stock === 'low' && !(p.active && avail(p) > 0 && p.stock_qty <= p.reorder_level)) return false;
      return !q || `${p.sku} ${p.brand} ${p.model} ${p.variant}`.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  const filtered = brand !== 'all' || country !== 'all' || grade !== 'all' || storage !== 'all' || stock !== 'all' || !!q;
  const clear = () => {
    setBrand('all');
    setCountry('all');
    setGrade('all');
    setStorage('all');
    setStock('all');
    setQ('');
  };
  const sel = cx(inputCls, 'rounded-full');
  return (
    <Card>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <select className={sel} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          <option value="all">All countries</option>
          {countries.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className={sel} value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
          <option value="all">All brands</option>
          {brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select className={sel} value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
          <option value="all">All grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </select>
        <select className={sel} value={storage} onChange={(e) => setStorage(e.target.value)} aria-label="Storage">
          <option value="all">All storage</option>
          {storages.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className={sel} value={stock} onChange={(e) => setStock(e.target.value as typeof stock)} aria-label="Stock">
          <option value="all">All stock</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <SearchInput value={q} onChange={setQ} placeholder="ID, brand, model" />
      </div>
      {filtered && (
        <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
          <span>
            {rows.length} of {list.length} products
          </span>
          <button onClick={clear} className="font-medium text-orange-600 hover:text-orange-700">
            Clear filters
          </button>
        </div>
      )}
      {!products ? (
        <Loading />
      ) : !rows.length ? (
        filtered ? <Empty title="No products match these filters" text="Change or clear the filters." /> : <Empty title="No products" text="Add your first product to start tracking stock." />
      ) : (
        <Table head={['ID', 'Product', 'Grade', 'Cost', 'Price', 'On hand', 'Reserved', 'Available', 'Supplier', 'Status', '']} minWidth={1000}>
          {rows.map((p) => {
            const low = p.stock_qty <= p.reorder_level;
            return (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className={cx(td, 'font-mono text-xs text-slate-500')}>{p.sku}</td>
                <td className={td}>
                  <div className="text-slate-800 font-medium">{p.brand} {p.model}</div>
                  <div className="text-[11px] text-slate-400">{p.variant}</div>
                </td>
                <td className={cx(td, 'text-slate-600')}>{p.grade || p.condition}</td>
                <td className={cx(td, 'tabular-nums text-slate-600')}>{money(p.cost_price, p.currency)}</td>
                <td className={cx(td, 'tabular-nums font-medium')}>{money(p.sale_price, p.currency)}</td>
                <td className={cx(td, 'tabular-nums font-semibold', low ? 'text-rose-600' : 'text-slate-800')}>{num(p.stock_qty)}</td>
                <td className={cx(td, 'tabular-nums text-slate-600')}>{num(p.reserved_qty || 0)}</td>
                <td className={cx(td, 'tabular-nums')}>{num(p.stock_qty - (p.reserved_qty || 0))}</td>
                <td className={cx(td, 'text-slate-600')}>{(p.supplier_id && sup.get(p.supplier_id)) || '—'}</td>
                <td className={td}>{!p.active ? <StatusDot color="gray" label="Inactive" /> : avail(p) <= 0 ? <StatusDot color="red" label="Out of stock" /> : low ? <StatusDot color="amber" label="Low stock" /> : <StatusDot color="green" label="In stock" />}</td>
                <td className={cx(td, 'whitespace-nowrap text-right')}>
                  {canManage && (
                    <>
                      <button onClick={() => onMove(p)} className="text-xs rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1.5 mr-1.5 inline-flex items-center gap-1">
                        <PackagePlus className="w-3.5 h-3.5" /> Stock
                      </button>
                      <button onClick={() => onEdit(p)} className="w-8 h-8 rounded-full hover:bg-slate-100 inline-flex items-center justify-center" aria-label="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );
}

function MovementLog({ movements, products }: { movements: InventoryMovement[] | null; products: Product[] }) {
  const [type, setType] = useState<'all' | InventoryMovement['type']>('all');
  const [q, setQ] = useState('');
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = (movements || []).filter((m) => {
    if (type !== 'all' && m.type !== type) return false;
    if (!q) return true;
    const p = byId.get(m.product_id);
    return `${p?.brand} ${p?.model} ${m.reference} ${m.note}`.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <Card>
      <div className="flex flex-col lg:flex-row gap-3 justify-between mb-4">
        <PillTabs value={type} onChange={setType} items={[{ id: 'all', label: 'All' }, { id: 'in', label: 'In' }, { id: 'out', label: 'Out' }, { id: 'adjustment', label: 'Adjustments' }, { id: 'return', label: 'Returns' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Product, order no, PO" />
      </div>
      {!movements ? (
        <Loading />
      ) : (
        <Table head={['Date', 'Product', 'Type', 'Qty', 'Reference', 'Note']} minWidth={760}>
          {rows.slice(0, 300).map((m) => {
            const p = byId.get(m.product_id);
            return (
              <tr key={m.id}>
                <td className={cx(td, 'text-slate-500 whitespace-nowrap')}>{dateTime(m.created_at)}</td>
                <td className={td}>{p ? `${p.brand} ${p.model} ${p.variant || ''}` : 'Deleted product'}</td>
                <td className={td}>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-700">
                    {m.quantity >= 0 ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowUpRight className="w-3.5 h-3.5 text-orange-600" />}
                    {MOVE_LABEL[m.type]}
                  </span>
                </td>
                <td className={cx(td, 'tabular-nums font-semibold', m.quantity >= 0 ? 'text-emerald-700' : 'text-slate-800')}>{m.quantity > 0 ? `+${num(m.quantity)}` : num(m.quantity)}</td>
                <td className={cx(td, 'font-mono text-xs text-slate-500')}>{m.reference || '—'}</td>
                <td className={cx(td, 'text-slate-500')}>{m.note || ''}</td>
              </tr>
            );
          })}
        </Table>
      )}
      {rows.length > 300 && <p className="text-xs text-slate-400 mt-3">Showing the newest 300 of {rows.length}.</p>}
    </Card>
  );
}

function ProductModal({ product, suppliers, onClose, onSaved }: { product: Product | null; suppliers: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    sku: product?.sku || '',
    brand: product?.brand || '',
    model: product?.model || '',
    variant: product?.variant || '',
    condition: product?.condition || 'new',
    cost_price: product?.cost_price ?? 0,
    sale_price: product?.sale_price ?? 0,
    reorder_level: product?.reorder_level ?? 10,
    supplier_id: product?.supplier_id || '',
    location: product?.location || '',
    active: product?.active ?? true,
    opening_stock: 0,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { ...f, supplier_id: f.supplier_id || null };
      delete body.sku; // the ID is given by the server and never changes
      if (product) delete body.opening_stock;
      await api(product ? `/api/biz/products/${product.id}` : '/api/biz/products', { method: product ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!product || !confirm(`Delete ${product.brand} ${product.model}? This cannot be undone.`)) return;
    try {
      await api(`/api/biz/products/${product.id}`, { method: 'DELETE' });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <Modal open onClose={onClose} title={product ? 'Edit product' : 'Add product'} wide>
      <ErrorNote text={err} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Brand"><input className={inputCls} value={f.brand} onChange={set('brand')} placeholder="Apple" /></Field>
        <Field label="Model"><input className={inputCls} value={f.model} onChange={set('model')} placeholder="iPhone 15 Pro" /></Field>
        <Field label="Variant"><input className={inputCls} value={f.variant} onChange={set('variant')} placeholder="256GB Black" /></Field>
        <Field label="ID"><input className={cx(inputCls, 'bg-slate-50 text-slate-500 font-mono')} value={f.sku || 'Auto (next INV number)'} readOnly title="Given automatically in sequence: INV-0001, INV-0002, ..." /></Field>
        <Field label="Condition">
          <select className={inputCls} value={f.condition} onChange={set('condition')}>
            <option value="new">New</option>
            <option value="refurbished">Refurbished</option>
            <option value="used">Used</option>
          </select>
        </Field>
        <Field label="Supplier">
          <select className={inputCls} value={f.supplier_id} onChange={set('supplier_id')}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label={`Cost price (${product?.currency || INVENTORY_CURRENCY})`}><input type="number" min={0} className={inputCls} value={f.cost_price} onChange={set('cost_price')} /></Field>
        <Field label={`Sale price (${product?.currency || INVENTORY_CURRENCY})`}><input type="number" min={0} className={inputCls} value={f.sale_price} onChange={set('sale_price')} /></Field>
        <Field label="Reorder level"><input type="number" min={0} className={inputCls} value={f.reorder_level} onChange={set('reorder_level')} /></Field>
        <Field label="Location"><input className={inputCls} value={f.location} onChange={set('location')} placeholder="Warehouse A" /></Field>
        {!product && <Field label="Opening stock" hint="Recorded in the movement log"><input type="number" min={0} className={inputCls} value={f.opening_stock} onChange={set('opening_stock')} /></Field>}
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
          <input type="checkbox" checked={f.active} onChange={set('active')} className="accent-orange-500 w-4 h-4" /> Active (can be sold)
        </label>
      </div>
      {product && <p className="text-[11px] text-slate-400 mt-3">Stock quantity is changed with the Stock button so every change is logged.</p>}
      <div className="flex justify-between gap-2 mt-5">
        {product ? <Button variant="danger" onClick={remove}>Delete</Button> : <span />}
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
    </Modal>
  );
}

function MovementModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<InventoryMovement['type']>('in');
  const [qty, setQty] = useState(10);
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const signed = type === 'out' ? -Math.abs(qty) : type === 'adjustment' ? qty : Math.abs(qty);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/biz/inventory', { method: 'POST', body: JSON.stringify({ product_id: product.id, type, quantity: qty, reference: ref || null, note: note || null }) });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Stock: ${product.brand} ${product.model}`}>
      <ErrorNote text={err} />
      <div className="space-y-3">
        <PillTabs value={type} onChange={setType} items={[{ id: 'in', label: 'Stock in' }, { id: 'out', label: 'Stock out' }, { id: 'return', label: 'Return' }, { id: 'adjustment', label: 'Adjust ±' }]} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={type === 'adjustment' ? 'Change (+/-)' : 'Quantity'}>
            <input type="number" className={inputCls} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
          </Field>
          <Field label="Reference" hint="PO, order no, ...">
            <input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
        </div>
        <Field label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm flex justify-between">
          <span className="text-slate-500">Stock after</span>
          <span className="font-semibold">{num(product.stock_qty)} → {num(product.stock_qty + signed)}</span>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} loading={busy} disabled={!qty}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
