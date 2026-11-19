'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Mail, Phone, Plus, Star, X, Pencil } from 'lucide-react';
import type { Supplier } from '@/lib/biz/types';
import { ExportButton } from '../ExportButton';
import { api, Avatar, Button, Card, Chip, cx, Empty, ErrorNote, Field, inputCls, Loading, Modal, num, PageHeader, SearchInput, StatusDot, Table, td } from '../ui';

type Row = Supplier & { skus: number; units: number };

function SearchableSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  placeholder?: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:border-slate-300 flex items-center gap-1.5 whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-slate-400"
      >
        <span>
          <b className="font-semibold text-slate-600">{label}:</b> {selectedOption ? selectedOption.label : 'All'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl z-30 p-2 text-xs">
          <input
            autoFocus
            type="text"
            placeholder={placeholder || `Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:border-slate-400 mb-1.5"
          />
          <div className="max-h-48 overflow-y-auto space-y-0.5 scrollbar-thin">
            <button
              type="button"
              onClick={() => {
                onChange('all');
                setOpen(false);
                setSearch('');
              }}
              className={cx(
                'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between',
                value === 'all' ? 'bg-slate-900 text-white font-medium' : 'hover:bg-slate-100 text-slate-700'
              )}
            >
              <span>All {label.toLowerCase()}</span>
              {value === 'all' && <span className="text-[10px]">✓</span>}
            </button>
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  setSearch('');
                }}
                className={cx(
                  'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between',
                  value === opt.value ? 'bg-slate-900 text-white font-medium' : 'hover:bg-slate-100 text-slate-700'
                )}
              >
                <span className="truncate">{opt.label}</span>
                {value === opt.value && <span className="text-[10px]">✓</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-2 text-slate-400 text-[11px]">No matches found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SuppliersView({ perms }: { perms: Set<string> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('all');
  const [brand, setBrand] = useState('all');
  const [edit, setEdit] = useState<Row | 'new' | null>(null);
  const canManage = perms.has('suppliers.manage');

  const load = useCallback(() => {
    api<{ suppliers: Row[] }>('/api/biz/suppliers')
      .then((d) => setRows(d.suppliers))
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const countryOptions = useMemo(() => {
    const list = Array.from(new Set((rows || []).map((s) => s.country).filter(Boolean) as string[])).sort();
    return list.map((c) => ({ label: c, value: c }));
  }, [rows]);

  const brandOptions = useMemo(() => {
    const list = Array.from(new Set((rows || []).flatMap((s) => s.brands || []).filter(Boolean) as string[])).sort();
    return list.map((b) => ({ label: b, value: b }));
  }, [rows]);

  const shown = (rows || []).filter((s) => {
    if (country !== 'all' && s.country !== country) return false;
    if (brand !== 'all' && !s.brands?.includes(brand)) return false;
    if (!q) return true;
    const term = q.toLowerCase();
    return [
      s.name,
      s.company,
      s.country,
      s.email,
      s.phone,
      s.code,
      s.contact_person,
      ...(s.brands || []),
    ].some((v) => v && v.toLowerCase().includes(term));
  });

  return (
    <div className="h-full overflow-y-auto pr-1">
      <PageHeader
        title="Suppliers"
        subtitle="Manage supplier profiles, contact details, partner brands and stock inventory."
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
            <SearchableSelect
              label="Country"
              value={country}
              options={countryOptions}
              placeholder="Search country..."
              onChange={setCountry}
            />

            <SearchableSelect
              label="Brand"
              value={brand}
              options={brandOptions}
              placeholder="Search brand..."
              onChange={setBrand}
            />

            {(country !== 'all' || brand !== 'all' || q) && (
              <button
                type="button"
                onClick={() => {
                  setCountry('all');
                  setBrand('all');
                  setQ('');
                }}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2 py-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

          <SearchInput value={q} onChange={setQ} placeholder="Search supplier, email, phone, brand..." />
        </div>

        {!rows ? (
          <Loading />
        ) : !shown.length ? (
          <Empty title="No suppliers match your search" text="Try clearing search filters or add a new supplier." />
        ) : (
          <Table head={['Supplier', 'Phone', 'Email', 'Country', 'Brands', 'Products', 'Units in stock', 'Rating', 'Status', '']} minWidth={900}>
            {shown.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                {/* 1. Supplier Name & Code */}
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} size={36} />
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        {s.name}
                        {s.code && (
                          <span className="text-[10px] text-slate-400 font-mono bg-slate-100 rounded px-1.5 py-0.5">
                            {s.code}
                          </span>
                        )}
                      </div>
                      {s.company && s.company !== s.name && (
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{s.company}</div>
                      )}
                    </div>
                  </div>
                </td>

                {/* 2. Phone Number Column */}
                <td className={cx(td, 'text-xs text-slate-700 whitespace-nowrap')}>
                  {s.phone ? (
                    <a
                      href={`https://wa.me/${s.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      +{s.phone.replace(/^\+/, '')}
                    </a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* 3. Email Column */}
                <td className={cx(td, 'text-xs text-slate-700 max-w-xs truncate')}>
                  {s.email ? (
                    <a
                      href={`mailto:${s.email}`}
                      className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {s.email}
                    </a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* 4. Country Column */}
                <td className={cx(td, 'text-xs font-medium text-slate-700 whitespace-nowrap')}>
                  {s.country || '—'}
                </td>

                {/* 5. Brands */}
                <td className={td}>
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {(s.brands || []).map((b) => (
                      <Chip key={b}>{b}</Chip>
                    ))}
                  </div>
                </td>

                {/* 6. Products Count */}
                <td className={cx(td, 'tabular-nums text-xs text-slate-700 font-medium')}>{s.skus}</td>

                {/* 7. Units in Stock */}
                <td className={cx(td, 'tabular-nums text-xs font-semibold text-slate-800')}>{num(s.units)}</td>

                {/* 8. Rating */}
                <td className={td}>
                  {s.rating ? (
                    <span className="inline-flex items-center gap-0.5 text-xs text-slate-700 font-medium" aria-label={`${s.rating} of 5`}>
                      <Star className="w-3.5 h-3.5 fill-orange-400 text-orange-400" /> {s.rating}/5
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* 9. Status */}
                <td className={td}>
                  {s.active ? <StatusDot color="green" label="Active" /> : <StatusDot color="gray" label="Inactive" />}
                </td>

                {/* 10. Actions */}
                <td className={cx(td, 'text-right')}>
                  {canManage && (
                    <button
                      onClick={() => setEdit(s)}
                      className="w-8 h-8 rounded-full hover:bg-slate-100 inline-flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
                      aria-label="Edit"
                    >
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

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        name: f.name.trim(),
        company: f.company.trim() || null,
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        country: f.country.trim() || null,
        brands: f.brands.split(',').map((b) => b.trim()).filter(Boolean),
        rating: f.rating === '' ? null : Number(f.rating),
        notes: f.notes.trim() || null,
        active: f.active,
      };
      await api(s ? `/api/biz/suppliers/${s.id}` : '/api/biz/suppliers', {
        method: s ? 'PATCH' : 'POST',
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
    <Modal open onClose={onClose} title={s ? `Edit ${s.name}` : 'New supplier'}>
      <ErrorNote text={err} />
      <div className="space-y-3">
        <Field label="Supplier name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Company"><input className={inputCls} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="971501234567" /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country"><input className={inputCls} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></Field>
          <Field label="Rating (1-5)">
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              className={inputCls}
              value={f.rating}
              onChange={(e) => setF({ ...f, rating: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Brands supplied" hint="Comma-separated (e.g. Apple, Samsung, Xiaomi)">
          <input className={inputCls} value={f.brands} onChange={(e) => setF({ ...f, brands: e.target.value })} />
        </Field>
        <Field label="Notes"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="accent-orange-500 w-4 h-4" />
          Active supplier
        </label>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="light" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!f.name.trim()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
