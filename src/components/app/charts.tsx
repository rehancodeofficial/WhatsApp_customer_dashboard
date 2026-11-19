'use client';
// Lightweight HTML charts (no chart library). Brand two-tone: deep slate + orange (hatched),
// validated for colour-blind separation. Orange is under 3:1 contrast on white, so every chart
// has a legend, hover tooltips and a table view; values are never colour-only.
import React, { useMemo, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { cx } from './ui';

export interface Series {
  key: string;
  label: string;
  /** 'slate' solid, 'orange' solid, 'hatch' hatched orange */
  tone: 'slate' | 'orange' | 'hatch';
}

const TONE: Record<Series['tone'], string> = {
  slate: 'bg-slate-800',
  orange: 'bg-orange-500',
  hatch: 'hatch-brand',
};

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}
const compact = (n: number) => (Math.abs(n) >= 10_000 ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : Math.round(n).toLocaleString('en'));

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-600">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className={cx('w-2.5 h-2.5 rounded-[3px]', TONE[s.tone])} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function ViewToggle({ table, setTable }: { table: boolean; setTable: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setTable(!table)}
      className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 rounded-full border border-slate-200 px-2 py-1"
      aria-label={table ? 'Show chart' : 'Show table'}
    >
      {table ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
      {table ? 'Chart' : 'Table'}
    </button>
  );
}

/**
 * Column chart, stacked (segments share a column, 2px gap) or grouped (side by side).
 * One shared y-axis. Each column is its own hover target showing every series.
 */
export function ColumnChart<T extends Record<string, any>>({
  data,
  series,
  xKey,
  mode = 'stack',
  height = 220,
  format = compact,
  title,
}: {
  data: T[];
  series: Series[];
  xKey: keyof T;
  mode?: 'stack' | 'group';
  height?: number;
  format?: (n: number) => string;
  title?: React.ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const totals = data.map((d) => (mode === 'stack' ? series.reduce((a, s) => a + Math.max(0, Number(d[s.key]) || 0), 0) : Math.max(...series.map((s) => Number(d[s.key]) || 0))));
  const max = niceMax(Math.max(0, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  // Show at most ~10 x labels.
  const every = Math.max(1, Math.ceil(data.length / 10));
  const barW = Math.max(6, Math.min(24, Math.floor(560 / Math.max(1, data.length)) - 6));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        {title || <span />}
        <div className="flex items-center gap-3">
          <Legend series={series} />
          <ViewToggle table={table} setTable={setTable} />
        </div>
      </div>
      {table ? (
        <div className="max-h-[260px] overflow-auto rounded-2xl border border-slate-200/70">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 sticky top-0">
              <tr>
                <th className="text-left font-medium px-3 py-2">Period</th>
                {series.map((s) => (
                  <th key={s.key} className="text-right font-medium px-3 py-2">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 text-slate-600">{String(d[xKey])}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right text-slate-800 tabular-nums">{format(Number(d[s.key]) || 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative rounded-2xl bg-slate-50/70 border border-slate-200/60 pl-11 pr-3 pt-3 pb-7">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="absolute left-0 right-0 border-t border-slate-200/80" style={{ bottom: `${(t / max) * 100}%` }}>
                <span className="absolute -left-11 -translate-y-1/2 w-9 text-right text-[10px] text-slate-400 tabular-nums">{compact(t)}</span>
              </div>
            ))}
            <div className="absolute inset-0 flex items-end justify-between gap-px">
              {data.map((d, i) => (
                <div
                  key={i}
                  className="relative flex-1 h-full flex items-end justify-center outline-none"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${String(d[xKey])}: ${series.map((s) => `${s.label} ${format(Number(d[s.key]) || 0)}`).join(', ')}`}
                >
                  {hover === i && <div className="absolute inset-y-0 w-full bg-slate-800/[0.04] rounded-md" />}
                  {mode === 'stack' ? (
                    <div className="relative flex flex-col-reverse gap-[2px]" style={{ width: barW, height: `${(totals[i] / max) * 100}%` }}>
                      {series.map((s, si) => {
                        const v = Math.max(0, Number(d[s.key]) || 0);
                        if (!v) return null;
                        const isTop = series.slice(si + 1).every((x) => !(Number(d[x.key]) > 0));
                        return <div key={s.key} className={cx(TONE[s.tone], isTop ? 'rounded-t-[4px]' : '', hover === i && 'opacity-90')} style={{ flexGrow: v, flexBasis: 0, minHeight: 2 }} />;
                      })}
                    </div>
                  ) : (
                    <div className="relative flex items-end gap-[2px] h-full">
                      {series.map((s) => {
                        const v = Math.max(0, Number(d[s.key]) || 0);
                        return <div key={s.key} className={cx(TONE[s.tone], 'rounded-t-[4px]')} style={{ width: Math.max(4, Math.floor(barW / series.length)), height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0 }} />;
                      })}
                    </div>
                  )}
                  {i % every === 0 && (
                    <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap">{String(d[xKey])}</span>
                  )}
                  {hover === i && (
                    <div
                      className={cx(
                        'absolute z-10 bottom-full mb-2 bg-white border border-slate-200 shadow-lg rounded-xl px-3 py-2 text-xs pointer-events-none whitespace-nowrap',
                        i > data.length * 0.7 ? 'right-0' : i < data.length * 0.3 ? 'left-0' : 'left-1/2 -translate-x-1/2'
                      )}
                    >
                      <div className="text-slate-500 mb-1">{String(d[xKey])}</div>
                      {series.map((s) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className={cx('w-3 h-[3px] rounded-full', TONE[s.tone])} />
                          <span className="font-semibold text-slate-800 tabular-nums">{format(Number(d[s.key]) || 0)}</span>
                          <span className="text-slate-500">{s.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars (one series): label, bar, value at the tip. */
export function BarList({
  rows,
  format = compact,
  tone = 'orange',
  max: maxRows = 8,
  sub,
}: {
  rows: { label: string; value: number; sub?: string }[];
  format?: (n: number) => string;
  tone?: Series['tone'];
  max?: number;
  sub?: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, maxRows);
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.value)), [rows]);
  if (!rows.length) return <p className="text-xs text-slate-400 py-6 text-center">No data in this period</p>;
  return (
    <div className="space-y-2.5">
      {shown.map((r) => (
        <div key={r.label} className="group" title={`${r.label}: ${format(r.value)}${r.sub ? ` · ${r.sub}` : ''}`}>
          <div className="flex items-center justify-between text-xs mb-1 gap-2">
            <span className="text-slate-700 truncate">{r.label}</span>
            <span className="text-slate-800 font-semibold tabular-nums shrink-0">
              {format(r.value)}
              {r.sub && <span className="text-slate-400 font-normal ml-1.5">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={cx('h-full rounded-full group-hover:opacity-85', TONE[tone])} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
      {rows.length > maxRows && (
        <button onClick={() => setAll(!all)} className="text-xs text-slate-500 hover:text-slate-800">
          {all ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

/** Progress meter like the reference "spending limit" bar. */
export function Meter({ value, max, label, right }: { value: number; max: number; label: React.ReactNode; right: React.ReactNode }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="h-3 rounded-full bg-orange-100 overflow-hidden">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs mt-2 text-slate-500">
        <span>{label}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}
