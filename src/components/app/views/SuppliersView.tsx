'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Mail, Phone, Plus, Star, X, Pencil, Check, Loader2 } from 'lucide-react';
import type { Supplier } from '@/lib/biz/types';
import { ExportButton } from '../ExportButton';
import { api, Avatar, Button, Card, Chip, cx, Empty, ErrorNote, Field, inputCls, Loading, Modal, num, PageHeader, SearchInput, StatusDot, Table, td } from '../ui';

type Row = Supplier & { skus: number; units: number };

const COMMON_BRANDS = ['Apple', 'Samsung', 'Google', 'Xiaomi', 'OnePlus', 'Oppo', 'Vivo', 'Huawei', 'Honor', 'Realme', 'Tecno', 'Infinix', 'Sony', 'Motorola'];

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

// Multi-select brand filter dropdown
function MultiBrandFilter({
  selected,
  options,
  onChange,
}: {
  selected: string[];
  options: string[];
  onChange: (brands: string[]) => void;
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
    return options.filter((b) => b.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (brand: string) => {
    if (selected.includes(brand)) {
      onChange(selected.filter((b) => b !== brand));
    } else {
      onChange([...selected, brand]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:border-slate-300 flex items-center gap-1.5 whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-slate-400"
      >
        <span>
          <b className="font-semibold text-slate-600">Brands:</b>{' '}
          {selected.length === 0
            ? 'All brands'
            : selected.length === 1
            ? selected[0]
            : `${selected.length} selected`}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-60 rounded-2xl bg-white border border-slate-200 shadow-xl z-30 p-2 text-xs">
          <div className="flex items-center justify-between px-1 pb-1 mb-1 border-b border-slate-100">
            <span className="font-semibold text-slate-700">Filter by Brands</span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] text-orange-600 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <input
            autoFocus
            type="text"
            placeholder="Search brands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:border-slate-400 mb-1.5"
          />
          <div className="max-h-48 overflow-y-auto space-y-0.5 scrollbar-thin">
            {filtered.map((b) => {
              const active = selected.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggle(b)}
                  className={cx(
                    'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between',
                    active ? 'bg-orange-50 text-orange-800 font-semibold' : 'hover:bg-slate-100 text-slate-700'
                  )}
                >
                  <span className="truncate">{b}</span>
                  <input
                    type="checkbox"
                    readOnly
                    checked={active}
                    className="accent-orange-500 rounded pointer-events-none w-3.5 h-3.5"
                  />
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-2 text-slate-400 text-[11px]">No brands found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type RowDraft = {
  name: string;
  company: string;
  phone: string;
  email: string;
  country: string;
  rating: string;
  notes: string;
  active: boolean;
  brands: string[];
};

function SupplierRow({
  s,
  allBrands,
  canManage,
  onSaved,
}: {
  s: Row;
  allBrands: string[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RowDraft>({
    name: s.name || '',
    company: s.company || '',
    phone: s.phone || '',
    email: s.email || '',
    country: s.country || '',
    rating: s.rating != null ? String(s.rating) : '',
    notes: s.notes || '',
    active: s.active,
    brands: s.brands || [],
  });
  const [busy, setBusy] = useState(false);
  const [rowErr, setRowErr] = useState<string | null>(null);

  const startEdit = () => {
    setDraft({
      name: s.name || '',
      company: s.company || '',
      phone: s.phone || '',
      email: s.email || '',
      country: s.country || '',
      rating: s.rating != null ? String(s.rating) : '',
      notes: s.notes || '',
      active: s.active,
      brands: s.brands || [],
    });
    setRowErr(null);
    setEditing(true);
  };
  const cancel = () => { setEditing(false); setRowErr(null); };

  const save = async () => {
    setBusy(true);
    setRowErr(null);
    try {
      await api(`/api/biz/suppliers/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          company: draft.company.trim() || null,
          phone: draft.phone.trim() || null,
          email: draft.email.trim() || null,
          country: draft.country.trim() || null,
          brands: draft.brands,
          rating: draft.rating === '' ? null : Number(draft.rating),
          notes: draft.notes.trim() || null,
          active: draft.active,
        }),
      });
      setEditing(false);
      onSaved();
    } catch (e: any) {
      setRowErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleBrand = (b: string) =>
    setDraft((d) => ({
      ...d,
      brands: d.brands.includes(b) ? d.brands.filter((x) => x !== b) : [...d.brands, b],
    }));

  const inCls = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100 min-w-[80px]';

  if (!editing) {
    return (
      <>
        <tr
          className={cx('transition-colors group', canManage ? 'hover:bg-orange-50/40 cursor-pointer' : 'hover:bg-slate-50/60')}
          onClick={canManage ? startEdit : undefined}
          title={canManage ? 'Click to edit' : undefined}
        >
          {/* 0. Supplier ID */}
          <td className={cx(td, 'whitespace-nowrap')}>
            {s.code ? (
              <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 rounded-md px-2 py-1">{s.code}</span>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </td>

          {/* 1. Supplier Name */}
          <td className={td}>
            <div className="flex items-center gap-3">
              <Avatar name={s.name} size={36} />
              <div>
                <div className="font-semibold text-slate-800">{s.name}</div>
                {s.company && s.company !== s.name && (
                  <div className="text-[11px] text-slate-500 truncate max-w-xs">{s.company}</div>
                )}
              </div>
            </div>
          </td>

          {/* 2. Phone */}
          <td className={cx(td, 'text-xs text-slate-700 whitespace-nowrap')}>
            {s.phone ? (
              <a
                href={`https://wa.me/${s.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                +{s.phone.replace(/^\+/, '')}
              </a>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </td>

          {/* 3. Email */}
          <td className={cx(td, 'text-xs text-slate-700 max-w-xs truncate')}>
            {s.email ? (
              <a
                href={`mailto:${s.email}`}
                className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                {s.email}
              </a>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </td>

          {/* 4. Country */}
          <td className={cx(td, 'text-xs font-medium text-slate-700 whitespace-nowrap')}>{s.country || '—'}</td>

          {/* 5. Brands */}
          <td className={td}>
            <div className="flex flex-wrap gap-1 max-w-xs">
              {(s.brands || []).map((b) => <Chip key={b}>{b}</Chip>)}
            </div>
          </td>

          {/* 6. Products */}
          <td className={cx(td, 'tabular-nums text-xs text-slate-700 font-medium')}>{s.skus}</td>

          {/* 7. Units */}
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

          {/* 10. Edit hint */}
          <td className={cx(td, 'text-right')}>
            {canManage && (
              <button
                onClick={(e) => { e.stopPropagation(); startEdit(); }}
                className="w-8 h-8 rounded-full inline-flex items-center justify-center text-slate-300 group-hover:text-orange-400 transition-colors opacity-0 group-hover:opacity-100"
                aria-label="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </td>
        </tr>
        {rowErr && (
          <tr>
            <td colSpan={11} className="px-4 py-1 text-xs text-red-600 bg-red-50 border-b border-red-100">{rowErr}</td>
          </tr>
        )}
      </>
    );
  }

  /* ── editing row ── */
  return (
    <>
      <tr className="bg-orange-50/60 ring-1 ring-inset ring-orange-200">
        {/* 0. Supplier ID — read only */}
        <td className={cx(td, 'whitespace-nowrap')}>
          {s.code ? (
            <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 rounded-md px-2 py-1">{s.code}</span>
          ) : <span className="text-xs text-slate-400">—</span>}
        </td>

        {/* 1. Name + Company */}
        <td className={td}>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <input className={inCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" aria-label="Name" />
            <input className={inCls} value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} placeholder="Company" aria-label="Company" />
          </div>
        </td>

        {/* 2. Phone */}
        <td className={td}>
          <input className={inCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="971501234567" aria-label="Phone" />
        </td>

        {/* 3. Email */}
        <td className={td}>
          <input className={inCls} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="email@example.com" aria-label="Email" />
        </td>

        {/* 4. Country */}
        <td className={td}>
          <input className={inCls} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} placeholder="Country" aria-label="Country" />
        </td>

        {/* 5. Brands — compact inline toggles */}
        <td className={td}>
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {allBrands.map((b) => {
              const on = draft.brands.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleBrand(b)}
                  className={cx(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                    on ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  )}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </td>

        {/* 6. Products — read only */}
        <td className={cx(td, 'tabular-nums text-xs text-slate-400')}>{s.skus}</td>

        {/* 7. Units — read only */}
        <td className={cx(td, 'tabular-nums text-xs text-slate-400')}>{num(s.units)}</td>

        {/* 8. Rating */}
        <td className={td}>
          <input
            className={inCls}
            type="number" min={1} max={5} step={0.1}
            value={draft.rating}
            onChange={(e) => setDraft({ ...draft, rating: e.target.value })}
            placeholder="1-5"
            aria-label="Rating"
            style={{ width: 60 }}
          />
        </td>

        {/* 9. Active toggle */}
        <td className={td}>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              className="accent-orange-500 w-4 h-4"
            />
            <span className="text-xs text-slate-600">{draft.active ? 'Active' : 'Inactive'}</span>
          </label>
        </td>

        {/* 10. Save / Cancel */}
        <td className={cx(td, 'whitespace-nowrap text-right')}>
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={save}
              disabled={busy || !draft.name.trim()}
              className="w-8 h-8 rounded-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 inline-flex items-center justify-center text-white transition-colors"
              aria-label="Save"
            >
              {busy ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={cancel}
              disabled={busy}
              className="w-8 h-8 rounded-full hover:bg-slate-200 inline-flex items-center justify-center text-slate-500 transition-colors"
              aria-label="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {rowErr && (
        <tr>
          <td colSpan={11} className="px-4 py-1 text-xs text-red-600 bg-red-50 border-b border-red-100">{rowErr}</td>
        </tr>
      )}
    </>
  );
}

export function SuppliersView({ perms }: { perms: Set<string> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('all');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [addNew, setAddNew] = useState(false);
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

  const allBrandOptions = useMemo(() => {
    const fromSuppliers = (rows || []).flatMap((s) => s.brands || []);
    return Array.from(new Set([...fromSuppliers, ...COMMON_BRANDS].filter(Boolean))).sort();
  }, [rows]);

  const shown = (rows || []).filter((s) => {
    if (country !== 'all' && s.country !== country) return false;
    // Match if supplier carries ANY of the selected brands
    if (selectedBrands.length > 0 && !selectedBrands.some((b) => s.brands?.includes(b))) {
      return false;
    }
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
        subtitle="Click any row to edit it inline — all fields are editable directly in the table."
        right={
          <>
            <ExportButton entity="suppliers" />
            {canManage && <Button onClick={() => setAddNew(true)}><Plus className="w-4 h-4" /> Add supplier</Button>}
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

            <MultiBrandFilter
              selected={selectedBrands}
              options={allBrandOptions}
              onChange={setSelectedBrands}
            />

            {(country !== 'all' || selectedBrands.length > 0 || q) && (
              <button
                type="button"
                onClick={() => {
                  setCountry('all');
                  setSelectedBrands([]);
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

        {/* Selected Brands Pills */}
        {selectedBrands.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3.5 pb-2.5 border-b border-slate-100">
            <span className="text-[11px] text-slate-400 font-medium mr-1">Filtered brands:</span>
            {selectedBrands.map((b) => (
              <span
                key={b}
                className="inline-flex items-center gap-1 text-[11px] bg-orange-50 text-orange-800 border border-orange-200 rounded-full px-2.5 py-0.5 font-medium"
              >
                {b}
                <button
                  type="button"
                  onClick={() => setSelectedBrands(selectedBrands.filter((item) => item !== b))}
                  className="hover:text-orange-950 ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {canManage && (
          <p className="text-[11px] text-slate-400 mb-3 flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Click any row to edit it directly
          </p>
        )}

        {!rows ? (
          <Loading />
        ) : !shown.length ? (
          <Empty title="No suppliers match your search" text="Try clearing search filters or add a new supplier." />
        ) : (
          <Table head={['Supplier ID', 'Supplier', 'Phone', 'Email', 'Country', 'Brands', 'Products', 'Units in stock', 'Rating', 'Status', '']} minWidth={980}>
            {shown.map((s) => (
              <SupplierRow
                key={s.id}
                s={s}
                allBrands={allBrandOptions}
                canManage={canManage}
                onSaved={load}
              />
            ))}
          </Table>
        )}
      </Card>

      {addNew && (
        <SupplierModal
          s={null}
          allBrands={allBrandOptions}
          onClose={() => setAddNew(false)}
          onSaved={() => {
            setAddNew(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function SupplierModal({
  s,
  allBrands,
  onClose,
  onSaved,
}: {
  s: Supplier | null;
  allBrands: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: s?.name || '',
    company: s?.company || '',
    phone: s?.phone || '',
    email: s?.email || '',
    country: s?.country || '',
    rating: s?.rating ?? '',
    notes: s?.notes || '',
    active: s?.active ?? true,
  });
  const [selectedBrands, setSelectedBrands] = useState<string[]>(s?.brands || []);
  const [customBrand, setCustomBrand] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  const addCustomBrand = (e: React.FormEvent) => {
    e.preventDefault();
    const b = customBrand.trim();
    if (b && !selectedBrands.includes(b)) {
      setSelectedBrands([...selectedBrands, b]);
      setCustomBrand('');
    }
  };

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
        brands: selectedBrands,
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
      <div className="space-y-3.5">
        <Field label="Supplier name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Shenzhen Bright Tech" /></Field>
        <Field label="Company"><input className={inputCls} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="e.g. Shenzhen Bright Tech LLC" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone / WhatsApp"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="971501234567" /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="supplier@example.com" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country"><input className={inputCls} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="e.g. United Arab Emirates" /></Field>
          <Field label="Rating (1-5)">
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              className={inputCls}
              value={f.rating}
              onChange={(e) => setF({ ...f, rating: e.target.value })}
              placeholder="e.g. 4.5"
            />
          </Field>
        </div>

        {/* Multi-Brand Selection Checkboxes & Chips */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Brands Supplied (Select multiple)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {allBrands.map((b) => {
              const active = selectedBrands.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleBrand(b)}
                  className={cx(
                    'px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 border',
                    active
                      ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                  )}
                >
                  {active && <Check className="w-3 h-3" />}
                  {b}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add other brand (e.g. Motorola)"
              value={customBrand}
              onChange={(e) => setCustomBrand(e.target.value)}
              className={cx(inputCls, 'text-xs')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomBrand(e);
                }
              }}
            />
            <Button variant="light" size="sm" type="button" onClick={addCustomBrand} disabled={!customBrand.trim()}>
              Add
            </Button>
          </div>
        </div>

        <Field label="Notes"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Internal notes or terms" /></Field>
        
        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="accent-orange-500 w-4 h-4" />
          Active supplier
        </label>
        
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="light" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!f.name.trim()}>Save supplier</Button>
        </div>
      </div>
    </Modal>
  );
}
