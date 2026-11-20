'use client';
// Small UI kit in the PhoneBuzz style: big rounded white cards on a light canvas, dark pill
// primary buttons, an orange highlight tile, pill tabs, status dots.
import React, { useEffect, useState } from 'react';
import { DEFAULT_CURRENCY } from '@/lib/currency';
import { ArrowDownRight, ArrowUpRight, Loader2, Search, X } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login';
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data as T;
}

export const money = (n: number, cur: string = DEFAULT_CURRENCY, compact = false) =>
  `${cur} ${compact && Math.abs(n) >= 10_000 ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : Math.round(n).toLocaleString('en')}`;
export const num = (n: number) => Math.round(n).toLocaleString('en');
export const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const dateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('bg-white rounded-3xl border border-slate-200/70 p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div>
        {/* The top bar already shows the page title. */}
        <h2 className="sr-only">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

type BtnVariant = 'dark' | 'light' | 'brand' | 'ghost' | 'danger';
export function Button({
  variant = 'dark',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    dark: 'bg-slate-800 text-white hover:bg-slate-700',
    light: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    brand: 'bg-orange-500 text-white hover:bg-orange-600',
    ghost: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
    danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200',
  };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2.5',
        v[variant],
        className
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

export function PillTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-full bg-white border border-slate-200/70 p-1 gap-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            'px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
            value === it.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-800'
          )}
        >
          {it.label}
          {it.count !== undefined && <span className={cx('ml-1.5 text-xs', value === it.id ? 'text-slate-300' : 'text-slate-400')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return null;
  const pct = ((now - prev) / Math.abs(prev)) * 100;
  const up = pct >= 0;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full', up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/** Stat tile. `highlight` renders the orange gradient hero tile. */
export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  delta,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  hint?: React.ReactNode;
  delta?: { now: number; prev: number };
  highlight?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-3xl p-4 sm:p-5 flex flex-col justify-between min-h-[132px]',
        highlight ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-[0_10px_30px_-12px_rgba(249,115,22,0.7)]' : 'bg-slate-50 border border-slate-200/70'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cx('text-sm', highlight ? 'text-orange-50' : 'text-slate-600')}>{label}</span>
        {Icon && (
          <span className={cx('w-8 h-8 rounded-full flex items-center justify-center shrink-0', highlight ? 'bg-white/20' : 'bg-white border border-slate-200')}>
            <Icon className={cx('w-4 h-4', highlight ? 'text-white' : 'text-slate-600')} />
          </span>
        )}
      </div>
      <div>
        <div className={cx('text-xl sm:text-2xl 2xl:text-[28px] font-semibold tracking-tight mt-3 leading-tight break-words', highlight ? 'text-white' : 'text-slate-800')}>{value}</div>
        <div className={cx('flex items-center gap-2 mt-1 text-[11px]', highlight ? 'text-orange-50' : 'text-slate-500')}>
          {delta && (highlight ? <span className="bg-white/20 rounded-full px-1.5 py-0.5 font-semibold">{deltaText(delta)}</span> : <Delta {...delta} />)}
          {hint}
        </div>
      </div>
    </div>
  );
}
function deltaText({ now, prev }: { now: number; prev: number }) {
  if (!prev) return '—';
  const pct = ((now - prev) / Math.abs(prev)) * 100;
  return `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(0)}%`;
}

const DOT: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  blue: 'bg-sky-500',
  gray: 'bg-slate-400',
  orange: 'bg-orange-500',
};
/** Status: a dot + label (never color alone). */
export function StatusDot({ color, label }: { color: keyof typeof DOT; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 whitespace-nowrap">
      <span className={cx('w-1.5 h-1.5 rounded-full', DOT[color])} />
      {label}
    </span>
  );
}

export function Chip({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'orange' | 'green' | 'red' | 'amber' }) {
  const t = {
    slate: 'bg-slate-100 text-slate-700',
    orange: 'bg-orange-50 text-orange-700 border border-orange-200',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-800',
  }[tone];
  return <span className={cx('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap', t)}>{children}</span>;
}

const AVATAR_TONES = ['bg-orange-100 text-orange-700', 'bg-slate-800 text-white', 'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-800', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-800'];
export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  const n = (name || '?').trim();
  const initials = n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={cx('rounded-full flex items-center justify-center font-semibold shrink-0', AVATAR_TONES[h % AVATAR_TONES.length])}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3.5 py-2 w-full sm:w-64 focus-within:border-orange-300">
      <Search className="w-4 h-4 text-slate-400 shrink-0" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-transparent outline-none text-sm w-full placeholder:text-slate-400" />
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';

/**
 * Number entry as a plain text box: no spinner arrows and no pre-filled "0" (empty means 0).
 * Only digits (and a dot when `decimals`) can be typed; the parent gets a number.
 */
export function NumInput({
  value,
  onChange,
  decimals = true,
  className,
  placeholder = '0',
  ...rest
}: { value: number | null | undefined; onChange: (n: number) => void; decimals?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const show = (v: number | null | undefined) => (v === null || v === undefined || v === 0 || Number.isNaN(v) ? '' : String(v));
  const [text, setText] = useState(show(value));
  // Follow outside changes (e.g. a price filled from the product) without fighting the typing.
  useEffect(() => {
    if ((Number(text) || 0) !== (value || 0)) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      autoComplete="off"
      className={cx(inputCls, className)}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        let t = e.target.value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, '');
        if (decimals) t = t.replace(/(\..*)\./g, '$1'); // one dot only
        setText(t);
        onChange(Number(t) || 0);
      }}
    />
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" onMouseDown={onClose}>
      <div
        className={cx('bg-white w-full rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[92dvh] flex flex-col', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {text && <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-2.5 mb-4">{text}</div>;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );
}

/** Table shell in the reference style: rounded inner panel, light header row. */
export function Table({ head, children, minWidth = 720 }: { head: React.ReactNode[]; children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="bg-slate-50 text-left text-xs text-slate-500">
            {head.map((h, i) => (
              <th key={i} className="font-medium px-4 py-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
export const td = 'px-4 py-3 align-middle';

/** Multi-select chips used by filters. */
export function ChipSelect({ options, value, onChange, render }: { options: string[]; value: string[]; onChange: (v: string[]) => void; render?: (o: string) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cx('px-3 py-1 rounded-full text-xs border transition-colors', on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}
            aria-pressed={on}
          >
            {render ? render(o) : o}
          </button>
        );
      })}
      {!options.length && <span className="text-xs text-slate-400">No options yet</span>}
    </div>
  );
}

export const TIER_LABEL = { high: 'High paying', medium: 'Medium', low: 'Low paying' } as const;
export function TierBadge({ tier, auto }: { tier: 'high' | 'medium' | 'low'; auto?: boolean }) {
  const color = tier === 'high' ? 'green' : tier === 'medium' ? 'amber' : 'gray';
  return <StatusDot color={color as any} label={`${TIER_LABEL[tier]}${auto ? '' : ' ★'}`} />;
}

/** Dropdown with a search box and check marks (multi-select). Empty selection = "All". */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'All',
  searchPlaceholder = 'Search…',
  render,
  sub,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  render?: (o: string) => string;
  sub?: (o: string) => string | undefined;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const label = (o: string) => (render ? render(o) : o);
  const shown = options.filter((o) => !q || `${label(o)} ${sub?.(o) || ''}`.toLowerCase().includes(q.toLowerCase()));
  const summary = !value.length ? placeholder : value.length <= 2 ? value.map(label).join(', ') : `${value.length} selected`;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cx(inputCls, 'flex items-center justify-between gap-2 text-left', !value.length && 'text-slate-500')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{summary}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-slate-400"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full min-w-64 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="bg-transparent outline-none text-sm w-full" />
            </label>
          </div>
          <div className="max-h-64 overflow-y-auto py-1" role="listbox" aria-multiselectable>
            {shown.map((o) => {
              const on = value.includes(o);
              return (
                <button
                  type="button"
                  key={o}
                  role="option"
                  aria-selected={on}
                  onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50"
                >
                  <span className={cx('w-4 h-4 rounded border flex items-center justify-center shrink-0', on ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-300')}>
                    {on && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2 4 7.2 8 3" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-800">{label(o)}</span>
                    {sub?.(o) && <span className="block text-[11px] text-slate-500 truncate">{sub(o)}</span>}
                  </span>
                </button>
              );
            })}
            {!shown.length && <p className="px-3 py-3 text-xs text-slate-400">No match</p>}
          </div>
          <div className="flex justify-between gap-2 p-2 border-t border-slate-100">
            <button type="button" className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1" onClick={() => onChange(shown.length === options.length ? options : Array.from(new Set([...value, ...shown])))}>
              Select {q ? 'shown' : 'all'}
            </button>
            <button type="button" className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
