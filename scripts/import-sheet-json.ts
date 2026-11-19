/**
 * Loads a JSON export of the old Google Sheet tabs into sheet_rows (the dashboard's copy of the sheet)
 * and syncs them into the dashboard tables.
 *
 *   npx tsx --env-file=.env.local scripts/import-sheet-json.ts <dir> [Tab ...]
 *
 * <dir> holds one <Tab>.json per tab (an array of row objects, as n8n's Google Sheets node returns them).
 * A tab that already has rows in sheet_rows is skipped, so it is safe to run again.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { SHEET_TABS } from '@/lib/biz/sheet-store';
import { resolveSheet, syncRows } from '@/lib/biz/sheet-sync';

async function main() {
  const [dir, ...only] = process.argv.slice(2);
  if (!dir) throw new Error('Usage: import-sheet-json.ts <dir> [Tab ...]');
  if (isDemoMode()) throw new Error('Demo mode is on: set real Supabase env vars');
  const db = getAdminSupabase();
  for (const tab of only.length ? only : SHEET_TABS) {
    const file = join(dir, `${tab}.json`);
    if (!existsSync(file)) { console.log(`${tab}: no file, skipped`); continue; }
    const rows = (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>[])
      .filter((r) => r && Object.keys(r).length)
      .map(({ row_number, ...r }) => r);
    const { count } = await db.from('sheet_rows').select('id', { count: 'exact', head: true }).eq('sheet', tab);
    if (count) { console.log(`${tab}: already has ${count} rows, skipped`); continue; }
    if (rows.length) {
      const { error } = await db.from('sheet_rows').insert(rows.map((data) => ({ sheet: tab, data })));
      if (error) throw new Error(`${tab}: ${error.message}`);
    }
    const typed = resolveSheet(tab);
    let synced = '';
    if (typed && rows.length) {
      const res = await syncRows(typed, rows);
      const bad = res.filter((r: any) => !r.ok);
      synced = `, dashboard sync ${res.length - bad.length}/${res.length}` + (bad.length ? ` (${bad.map((b: any) => b.error).join('; ')})` : '');
    }
    console.log(`${tab}: ${rows.length} rows${synced}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
