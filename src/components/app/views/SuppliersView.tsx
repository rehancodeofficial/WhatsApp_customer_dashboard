'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Star } from 'lucide-react';
import type { Supplier } from '@/lib/biz/types';
import { ExportButton } from '../ExportButton';
import { BarList } from '../charts';
import { api, Avatar, Button, Card, Chip, cx, Empty, ErrorNote, Field, inputCls, Loading, Modal, num, PageHeader, SearchInput, StatusDot, Table, td } from '../ui';

type Row = Supplier & { skus: number; units: number };

export function SuppliersView({ perms }: { perms: Set<string> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('all');
  const [brand, setBrand] = useState('all');
  const [edit, setEdit] = useState<Row | 'new' | null>(null);
  const canManage = perms.has('suppliers.manage');
  const load = useCallback(() => {
    api<{ suppliers: Row[] }>('/api/biz/suppliers').then((d) => setRows(d.suppliers)).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const countries = Array.from(new Set((rows || []).map((s) => s.country).filter(Boolean) as string[])).sort();
  const brands = Array.from(new Set((rows || []).flatMap((s) => s.brands || []).filter(Boolean) as string[])).sort();

  const shown = (rows || []).filter((s) => {
    if (country !== 'all' && s.country !== country) return false;
    if (brand !== 'all' && !s.brands?.includes(brand)) return false;
    if (!q) return true;
    return [s.name, s.company, s.country, ...(s.brands || [])].some((v) => v && v.toLowerCase().includes(q.toLowerCase()));
  });

  return (
    <div className="h-full overflow-y-auto pr-1">
      <PageHeader
        title="Suppliers"
        subtitle="Who you buy from, the brands they carry and how much of your stock came from them."
        right={
          <>
            <ExportButton entity="suppliers" />
            {canManage && <Button onClick={() => setEdit('new')}><Plus className="w-4 h-4" /> Add supplier</Button>}
          </>
        }
      />
      <ErrorNote text={err} />
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 outline-none focus:border-slate-400"
              aria-label="Filter by country"
            >
              <option value="all">All countries ({rows?.length || 0})</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 outline-none focus:border-slate-400"
              aria-label="Filter by brand"
            >
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            {(country !== 'all' || brand !== 'all' || q) && (
              <button
                onClick={() => {
                  setCountry('all');
                  setBrand('all');
                  setQ('');
                }}
                className="text-xs text-slate-500 hover:text-slate-800 underline ml-1"
              >
                Reset filters
              </button>
            )}
          </div>

          <SearchInput value={q} onChange={setQ} placeholder="Name, country, brand" />
        </div>
        {!rows ? (
          <Loading />
        ) : !shown.length ? (
          <Empty title="No suppliers yet" />
        ) : (
          <Table head={['Supplier', 'Country', 'Brands', 'Products', 'Units in stock', 'Rating', 'Status', '']}>
            {shown.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} size={36} />
                    <div>
                      <div className="font-medium text-slate-800">{s.name} {s.code && <span className="text-[11px] text-slate-400 font-mono">{s.code}</span>}</div>
                      <div className="text-[11px] text-slate-400">{[s.phone && `+${s.phone.replace(/^\+/, '')}`, s.email].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                </td>
                <td className={cx(td, 'text-slate-600')}>{s.country || '—'}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">{s.brands.map((b) => <Chip key={b}>{b}</Chip>)}</div>
                </td>
                <td className={cx(td, 'tabular-nums')}>{s.skus}</td>
                <td className={cx(td, 'tabular-nums')}>{num(s.units)}</td>
                <td className={td}>
                  {s.rating ? (
                    <span className="inline-flex items-center gap-0.5 text-xs text-slate-700" aria-label={`${s.rating} of 5`}>
                      <Star className="w-3.5 h-3.5 fill-orange-400 text-orange-400" /> {s.rating}/5
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={td}>{s.active ? <StatusDot color="green" label="Active" /> : <StatusDot color="gray" label="Inactive" />}</td>
                <td className={cx(td, 'text-right')}>
                  {canManage && (
                    <button onClick={() => setEdit(s)} className="w-8 h-8 rounded-full hover:bg-slate-100 inline-flex items-center justify-center" aria-label="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {edit && (
        <SupplierModal
          s={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SupplierModal({ s, onClose, onSaved }: { s: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: s?.name || '',
    company: s?.company || '',
    phone: s?.phone || '',
    email: s?.email || '',
    country: s?.country || '',
    brands: (s?.brands || []).join(', '),
    rating: s?.rating ?? '',
    notes: s?.notes || '',
    active: s?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(s ? `/api/biz/suppliers/${s.id}` : '/api/biz/suppliers', {
        method: s ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...f, rating: f.rating === '' ? null : Number(f.rating), brands: f.brands.split(',').map((x) => x.trim()).filter(Boolean) }),
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!s || !confirm(`Delete supplier ${s.name}? Products keep their stock but lose the supplier link.`)) return;
    try {
      await api(`/api/biz/suppliers/${s.id}`, { method: 'DELETE' });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <Modal open onClose={onClose} title={s ? 'Edit supplier' : 'Add supplier'} wide>
      <ErrorNote text={err} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Company"><input className={inputCls} value={f.company} onChange={set('company')} /></Field>
        <Field label="WhatsApp / phone"><input className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><input className={inputCls} value={f.email} onChange={set('email')} /></Field>
        <Field label="Country"><input className={inputCls} value={f.country} onChange={set('country')} /></Field>
        <Field label="Brands" hint="Comma separated"><input className={inputCls} value={f.brands} onChange={set('brands')} /></Field>
        <Field label="Rating">
          <select className={inputCls} value={String(f.rating)} onChange={set('rating')}>
            <option value="">—</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>{r} / 5</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
          <input type="checkbox" checked={f.active} onChange={set('active')} className="accent-orange-500 w-4 h-4" /> Active
        </label>
        <div className="sm:col-span-2">
          <Field label="Notes"><textarea rows={3} className={inputCls} value={f.notes} onChange={set('notes')} /></Field>
        </div>
      </div>
      <div className="flex justify-between mt-5">
        {s ? <Button variant="danger" onClick={remove}>Delete</Button> : <span />}
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
    </Modal>
  );
}
