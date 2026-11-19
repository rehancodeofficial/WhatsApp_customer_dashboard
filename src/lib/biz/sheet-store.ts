// The old n8n Google Sheet, now stored in Supabase (table sheet_rows, one JSON row per sheet row).
// n8n calls /api/n8n/sheet/<Tab> with the same lookups and writes it used to do on Google Sheets,
// and gets back rows with the same column names (plus row_number), so the workflow logic is unchanged.
import { getAdminSupabase } from '@/lib/supabase/admin';

export type SheetRow = Record<string, unknown>;
export type WriteOp = 'append' | 'update' | 'appendOrUpdate';

interface Stored {
  id: number;
  sheet: string;
  data: SheetRow;
}

const norm = (v: unknown) => (v == null ? '' : String(v)).trim();
const db = () => getAdminSupabase();

/** Tab names as n8n used them (any case / spacing is accepted). */
export const SHEET_TABS = [
  'Customer_Leads',
  'Customers',
  'Inventory',
  'Orders',
  'Order_Items',
  'Suppliers',
  'Supplier_Requests',
  'Supplier_Quotes',
  'Supplier_Demands',
  'CompanyInfo',
  'FAQ',
  'WholesalePolicy',
] as const;

export function resolveTab(name: string): string | null {
  const k = name.toLowerCase().replace(/[^a-z]/g, '');
  return SHEET_TABS.find((s) => s.toLowerCase().replace(/[^a-z]/g, '') === k) ?? null;
}

const out = (r: Stored): SheetRow => ({ row_number: r.id, ...r.data });

async function loadAll(sheet: string): Promise<Stored[]> {
  const rows: Stored[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('sheet_rows').select('id, sheet, data').eq('sheet', sheet).order('id').range(from, from + 999);
    if (error) throw new Error('sheet read failed: ' + error.message);
    rows.push(...((data || []) as Stored[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function findMatches(sheet: string, column: string, value: unknown): Promise<Stored[]> {
  const v = norm(value);
  if (!column || !v) return [];
  // Fast path: exact JSON string match; then a loose pass for numbers / spacing differences.
  if (/^[A-Za-z0-9_]+$/.test(column)) {
    const { data } = await db().from('sheet_rows').select('id, sheet, data').eq('sheet', sheet).eq(`data->>${column}`, v).order('id');
    if (data && data.length) return data as Stored[];
  }
  return (await loadAll(sheet)).filter((r) => norm(r.data[column]) === v);
}

/** Google Sheets "Get row(s)": optional single-column filter, optional first match only. */
export async function readRows(sheet: string, filter?: { column?: string; value?: unknown; first?: boolean }): Promise<SheetRow[]> {
  let rows: Stored[];
  if (filter?.column) rows = await findMatches(sheet, filter.column, filter.value);
  else rows = await loadAll(sheet);
  if (filter?.first) rows = rows.slice(0, 1);
  return rows.map(out);
}

function clean(row: SheetRow): SheetRow {
  const r: SheetRow = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (k === 'row_number' || k.startsWith('__')) continue;
    r[k] = v === undefined ? '' : v;
  }
  return r;
}

/**
 * Google Sheets append / update / appendOrUpdate. `match` is the matching column.
 * Returns the full stored rows after the write (what n8n sees as the node output).
 */
export async function writeRow(sheet: string, op: WriteOp, match: string | null, input: SheetRow): Promise<SheetRow[]> {
  const row = clean(input);
  const now = new Date().toISOString();
  if (op !== 'append' && match) {
    const hits = await findMatches(sheet, match, row[match]);
    if (hits.length) {
      const target = hits[0];
      const data = { ...target.data, ...row };
      const { data: saved, error } = await db().from('sheet_rows').update({ data, updated_at: now }).eq('id', target.id).select('id, sheet, data').single();
      if (error) throw new Error('sheet update failed: ' + error.message);
      return [out(saved as Stored)];
    }
    // Google Sheets "update" never adds a row: hand the input back unchanged.
    if (op === 'update') return [row];
  }
  const { data: saved, error } = await db().from('sheet_rows').insert({ sheet, data: row }).select('id, sheet, data').single();
  if (error) throw new Error('sheet append failed: ' + error.message);
  return [out(saved as Stored)];
}

/** Used by the dashboard itself (e.g. inventory edits) to keep the AI's data current. */
export async function upsertByKey(sheet: string, key: string, row: SheetRow) {
  return writeRow(sheet, 'appendOrUpdate', key, row);
}
