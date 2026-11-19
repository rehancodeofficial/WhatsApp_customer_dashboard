/**
 * Copies the n8n Google Sheet ("PhoneBuzz") into the dashboard database (Supabase).
 *
 *   npm run import-sheet-db                       # uses GOOGLE_SHEET_ID or the PhoneBuzz sheet
 *   npm run import-sheet-db -- <sheetId>
 *
 * The sheet must be shared as "Anyone with the link can view" (it is read as CSV).
 * Safe to run again: every row is matched by its sheet ID (Lead_ID, ID, Order_ID, Supplier_ID,
 * Request_ID, Quote_ID, Demand_ID) and updated instead of duplicated. Chat transcripts are matched
 * by a stable hash per message.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local) and must NOT run
 * in demo mode.
 */
import { createHash } from 'crypto';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { syncRows, type SyncSheet } from '@/lib/biz/sheet-sync';

const SHEET_ID = process.argv[2] || process.env.GOOGLE_SHEET_ID || '1DiZqu62aIY4uqWiGBTLEVVexuxOQpmwlzI8w79IWXH0';

if (isDemoMode()) {
  console.error('Demo mode is on (NEXT_PUBLIC_DEMO_MODE=true or no real Supabase URL). Turn it off to import into Supabase.');
  process.exit(1);
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()]).filter(([h]) => h)));
}

async function readTab(name: string) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read tab ${name} (${res.status}). Is the sheet shared "Anyone with the link"?`);
  const rows = parseCsv(await res.text());
  // gviz returns the first tab when a tab name does not exist: check the expected key column.
  return rows;
}

const ORDER: { tab: SyncSheet; key: string }[] = [
  { tab: 'Suppliers', key: 'Supplier_ID' },
  { tab: 'Inventory', key: 'ID' },
  { tab: 'Customer_Leads', key: 'Lead_ID' },
  { tab: 'Customers', key: 'Customer_ID' },
  { tab: 'Orders', key: 'Order_ID' },
  { tab: 'Order_Items', key: 'Order_Item_ID' },
  { tab: 'Supplier_Requests', key: 'Request_ID' },
  { tab: 'Supplier_Quotes', key: 'Quote_ID' },
  { tab: 'Supplier_Demands', key: 'Demand_ID' },
];

/** "Customer: hi\nAI [SR-1]: hello" → messages. Lines that don't start a new speaker continue the previous one. */
function parseTranscript(text: string) {
  const out: { who: string; body: string }[] = [];
  const re = /^(Customer|Supplier|AI|Owner|Agent|Human agent|Sales|System)(?:\s*\[[^\]]*\])?\s*:\s?(.*)$/i;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = line.match(re);
    if (m) out.push({ who: m[1].toLowerCase(), body: m[2] });
    else if (out.length) out[out.length - 1].body += '\n' + line;
  }
  return out.map((m) => ({ ...m, body: m.body.trim() })).filter((m) => m.body);
}

async function importChats(tab: 'Customer_Chats' | 'Supplier_Chats') {
  const db = getAdminSupabase();
  const party = tab === 'Supplier_Chats' ? 'supplier' : 'customer';
  const rows = (await readTab(tab)).filter((r) => 'Conversation' in r);
  let msgs = 0;
  let skipped = 0;
  for (const r of rows) {
    const wa = (r.WhatsApp_Number || '').replace(/[^0-9]/g, '');
    if (wa.length < 7) {
      skipped++; // e-mail-only conversation: the inbox is WhatsApp
      continue;
    }
    const name = r.Supplier_Name || r.Customer_Name || null;
    const { data: contact, error: cErr } = await db
      .from('contacts')
      .upsert({ wa_id: wa, kind: party, ...(name ? { name } : {}) }, { onConflict: 'wa_id' })
      .select('id')
      .single();
    if (cErr || !contact) throw new Error(`${tab}: contact ${wa}: ${cErr?.message}`);
    let { data: conv } = await db.from('conversations').select('id').eq('contact_id', contact.id).maybeSingle();
    if (!conv) {
      const { data, error } = await db.from('conversations').insert({ contact_id: contact.id, channel: 'whatsapp', mode: 'ai', ai_enabled: true }).select('id').single();
      if (error) throw new Error(`${tab}: conversation ${wa}: ${error.message}`);
      conv = data;
    }
    const lines = parseTranscript(r.Conversation || '');
    const end = Date.parse(r.Last_Updated) || Date.now();
    const rowsToInsert = lines.map((m, i) => {
      const inbound = m.who === 'customer' || m.who === 'supplier';
      return {
        conversation_id: conv!.id,
        channel: 'whatsapp',
        wa_message_id: 'sheet.' + createHash('sha1').update(`${tab}|${wa}|${i}|${m.body}`).digest('hex').slice(0, 24),
        direction: inbound ? 'inbound' : 'outbound',
        sender_type: inbound ? 'customer' : m.who === 'ai' ? 'ai' : m.who === 'system' ? 'system' : 'agent',
        type: 'text',
        body: m.body,
        status: inbound ? 'delivered' : 'sent',
        raw: { imported_from: tab },
        created_at: new Date(end - (lines.length - 1 - i) * 60_000).toISOString(),
      };
    });
    if (rowsToInsert.length) {
      const { error } = await db.from('messages').upsert(rowsToInsert, { onConflict: 'wa_message_id', ignoreDuplicates: true });
      if (error) throw new Error(`${tab}: messages ${wa}: ${error.message}`);
      msgs += rowsToInsert.length;
      const last = rowsToInsert[rowsToInsert.length - 1];
      const lastIn = [...rowsToInsert].reverse().find((m) => m.direction === 'inbound');
      await db
        .from('conversations')
        .update({ last_message_at: last.created_at, last_message_preview: last.body.slice(0, 120), ...(lastIn ? { last_customer_message_at: lastIn.created_at } : {}) })
        .eq('id', conv!.id);
    }
  }
  console.log(`  ${tab}: ${msgs} messages from ${rows.length - skipped} chats${skipped ? ` (${skipped} e-mail-only chats skipped)` : ''}`);
}

async function main() {
  console.log(`Importing Google Sheet ${SHEET_ID} into ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);
  let failed = 0;
  for (const { tab, key } of ORDER) {
    const rows = (await readTab(tab)).filter((r) => r[key]);
    const results = await syncRows(tab, rows);
    const bad = results.map((r, i) => ({ r, i })).filter((x) => !x.r.ok);
    failed += bad.length;
    console.log(`  ${tab.padEnd(18)} ${results.length - bad.length}/${rows.length} rows`);
    for (const b of bad) console.log(`     ✗ ${rows[b.i][key]}: ${b.r.error}`);
  }
  await importChats('Customer_Chats');
  await importChats('Supplier_Chats');
  console.log(failed ? `\nDone with ${failed} failed rows (see above).` : '\nDone. Everything imported.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
