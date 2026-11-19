import { NextRequest, NextResponse } from 'next/server';
import { checkN8nSecret } from '@/lib/config';
import { resolveSheet, syncRows, SYNC_SHEETS } from '@/lib/biz/sheet-sync';

// POST /api/n8n/sync/Customer_Leads  body: the same row n8n writes to the Google Sheet
// (one object, an array, or { rows: [...] }). Returns one result per row.
export async function POST(req: NextRequest, { params }: { params: Promise<{ sheet: string }> }) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sheet = resolveSheet((await params).sheet);
  if (!sheet) return NextResponse.json({ error: `Unknown sheet. Use one of: ${SYNC_SHEETS.join(', ')}` }, { status: 404 });
  const body = await req.json().catch(() => null);
  const rows: Record<string, unknown>[] = Array.isArray(body) ? body : Array.isArray(body?.rows) ? body.rows : body && typeof body === 'object' ? [body] : [];
  if (!rows.length) return NextResponse.json({ error: 'Send a row object' }, { status: 400 });
  if (rows.length > 500) return NextResponse.json({ error: 'At most 500 rows per call' }, { status: 400 });
  const results = await syncRows(sheet, rows);
  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ success: failed === 0, sheet, results }, { status: failed && failed === results.length ? 400 : 200 });
}
