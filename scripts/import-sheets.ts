/**
 * One-time import of the old Google Sheet data into the dashboard database.
 *
 * 1. In the "PhoneBuzz" Google Sheet, open the tab and use File -> Download -> CSV for:
 *      Customer_Leads   -> save as leads.csv
 *      Customer_Chats   -> save as chats.csv
 * 2. With NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set (e.g. from .env.local):
 *      npx tsx --env-file=.env.local scripts/import-sheets.ts leads.csv chats.csv
 *
 * Safe to run twice: contacts are matched by WhatsApp number and imported messages carry a
 * stable id, so nothing is duplicated. Email-only customers are skipped (the inbox is WhatsApp).
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { createHash } from 'crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || url.includes('mockproject') || url.includes('your-project')) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (real Supabase project).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** Minimal RFC 4180 CSV parser (quoted fields, commas and newlines inside quotes). */
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
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const digits = (v: string | undefined) => String(v || '').replace(/[^0-9]/g, '');
const stableId = (...parts: string[]) => 'import.' + createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24);

async function ensureConversation(wa_id: string, contact: Record<string, unknown>) {
  const { data: c, error } = await db
    .from('contacts')
    .upsert({ wa_id, ...contact, updated_at: new Date().toISOString() }, { onConflict: 'wa_id' })
    .select('id')
    .single();
  if (error || !c) throw new Error(`contact ${wa_id}: ${error?.message}`);
  const { data: conv, error: e2 } = await db
    .from('conversations')
    .upsert({ contact_id: c.id, channel: 'whatsapp' }, { onConflict: 'contact_id', ignoreDuplicates: false })
    .select('id, mode')
    .single();
  if (e2 || !conv) throw new Error(`conversation ${wa_id}: ${e2?.message}`);
  return conv.id as string;
}

async function main() {
  const [leadsPath, chatsPath] = process.argv.slice(2);
  if (!leadsPath) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/import-sheets.ts leads.csv [chats.csv]');
    process.exit(1);
  }

  let contacts = 0;
  for (const r of parseCsv(fs.readFileSync(leadsPath, 'utf8'))) {
    const wa = digits(r.WhatsApp_Number);
    if (wa.length < 6) continue;
    const convId = await ensureConversation(wa, {
      name: r.Customer_Name || null,
      country: r.Country || null,
      preferred_language: r.Preferred_Language || 'English',
      lead_id: r.Lead_ID || null,
      lead_status: r.Lead_Status || null,
      email: r.Email || null,
    });
    // Mirror the sheet's handoff state so the dashboard shows it correctly.
    if (r.Lead_Status === 'Handed Over to Sales') {
      await db.from('conversations').update({ mode: 'handoff', ai_enabled: false }).eq('id', convId);
    }
    contacts++;
  }
  console.log(`Contacts imported/updated: ${contacts}`);

  if (!chatsPath) return;
  let messages = 0;
  for (const r of parseCsv(fs.readFileSync(chatsPath, 'utf8'))) {
    if (r.Channel === 'By Email') continue;
    const wa = digits(r.WhatsApp_Number);
    if (wa.length < 6 || !r.Conversation) continue;
    const convId = await ensureConversation(wa, r.Customer_Name ? { name: r.Customer_Name } : {});

    // Build Customer Chat writes blocks like "Customer: ..." / "AI: ..." separated by blank lines.
    const blocks = r.Conversation.split(/\n\s*\n(?=(?:Customer|AI)(?: \(not delivered\))?: )/);
    const end = r.Last_Updated ? new Date(r.Last_Updated.replace(' ', 'T')).getTime() : Date.now();
    const rows = blocks
      .map((b, i) => {
        const m = b.match(/^(Customer|AI)( \(not delivered\))?: ([\s\S]*)$/);
        if (!m) return null;
        const fromCustomer = m[1] === 'Customer';
        return {
          conversation_id: convId,
          channel: 'whatsapp',
          wa_message_id: stableId(wa, String(i), m[3].slice(0, 200)),
          direction: fromCustomer ? 'inbound' : 'outbound',
          sender_type: fromCustomer ? 'customer' : 'ai',
          type: 'text',
          body: m[3].trim(),
          status: m[2] ? 'failed' : fromCustomer ? 'delivered' : 'sent',
          raw: { imported_from: 'Customer_Chats' },
          // Exact times are not in the sheet; space messages 1 minute apart ending at Last_Updated.
          created_at: new Date((isNaN(end) ? Date.now() : end) - (blocks.length - i) * 60000).toISOString(),
        };
      })
      .filter(Boolean) as Record<string, unknown>[];
    if (!rows.length) continue;
    const { error } = await db.from('messages').upsert(rows, { onConflict: 'wa_message_id', ignoreDuplicates: true });
    if (error) throw new Error(`messages ${wa}: ${error.message}`);
    const last = rows[rows.length - 1];
    await db
      .from('conversations')
      .update({ last_message_at: last.created_at, last_message_preview: String(last.body).slice(0, 200) })
      .eq('id', convId);
    messages += rows.length;
  }
  console.log(`Chat messages imported: ${messages}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
