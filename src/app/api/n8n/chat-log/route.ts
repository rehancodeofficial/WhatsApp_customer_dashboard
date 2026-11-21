import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { checkN8nSecret } from '@/lib/config';
import { getRepo } from '@/lib/repo';
import { emailKey } from '@/lib/biz/channel';

// Replaces the Customer_Chats / Supplier_Chats Google Sheets.
// n8n posts the output of its "Chat Rows" (customers) or "Supplier Chat Rows" (suppliers) node:
//   { party: 'customer' | 'supplier', rows: [{ Contact | WhatsApp_Number, Customer_Name | Supplier_Name,
//     From, Message, Message_Type, Status, Channel, Date_Time, Execution_ID, Request_ID }] }
//
// Customer messages that arrive on WhatsApp are saved by /api/n8n/inbound (that call also tells n8n
// whether the AI may answer), so here they are skipped. Email rows are skipped (no WhatsApp chat).
const digits = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '');
const str = (v: unknown) => (v == null ? '' : String(v)).trim();

export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const party = str(body?.party).toLowerCase() === 'supplier' ? 'supplier' : 'customer';
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : Array.isArray(body) ? body : [];
  if (!rows.length) return NextResponse.json({ error: 'Send { party, rows: [...] }' }, { status: 400 });
  if (rows.length > 200) return NextResponse.json({ error: 'At most 200 rows per call' }, { status: 400 });

  const repo = getRepo();
  const results: { ok: boolean; skipped?: string; error?: string }[] = [];
  for (const r of rows) {
    try {
      const channel = str(r.Channel).toLowerCase();
      const rawWa = party === 'supplier' ? r.WhatsApp_Number : r.Contact || r.WhatsApp_Number;
      let wa = digits(rawWa);
      const email = str(r.Email || (String(rawWa).includes('@') ? rawWa : ''));
      if (channel === 'email' || (!wa && email)) {
        wa = emailKey(email || 'unknown@customer.com');
      }
      const text = str(r.Message);
      if (!text) { results.push({ ok: true, skipped: 'empty' }); continue; }
      if (channel !== 'email' && wa.length < 6) { results.push({ ok: true, skipped: 'not a valid WhatsApp or email chat' }); continue; }
      const from = str(r.From);
      const name = str(party === 'supplier' ? r.Supplier_Name : r.Customer_Name) || null;
      // Stable id per message, so n8n retries never create duplicates.
      const id = 'n8n_' + createHash('sha1').update([party, wa, from, text, str(r.Execution_ID) || str(r.Date_Time)].join('|')).digest('hex').slice(0, 32);
      const raw = { source: 'n8n-chat-log', channel: channel === 'email' ? 'email' : 'whatsapp', message_type: r.Message_Type || null, request_id: r.Request_ID || null, lead_id: r.Customer_ID || null, n8n_status: r.Status || null };
      const incoming = /^(customer|supplier)/i.test(from);
      if (incoming) {
        // WhatsApp and email customer messages are saved by /api/n8n/inbound (it also returns the AI on/off mode).
        if (party === 'customer' && from === 'Customer') { results.push({ ok: true, skipped: 'saved by /api/n8n/inbound' }); continue; }
        await repo.ingestInbound({ wa_id: wa, party, wa_message_id: id, name, type: 'text', body: text, raw });
      } else {
        await repo.logOutbound({
          wa_id: wa,
          party,
          name,
          wa_message_id: id,
          type: /template/i.test(str(r.Message_Type)) ? 'template' : 'text',
          body: text,
          sender_type: /owner|salesman/i.test(from) ? 'agent' : 'ai',
          status: /^failed/i.test(str(r.Status)) ? 'failed' : 'sent',
          raw,
        });
      }
      results.push({ ok: true });
    } catch (e: any) {
      results.push({ ok: false, error: String(e?.message || e).slice(0, 200) });
    }
  }
  const failed = results.filter((x) => !x.ok).length;
  return NextResponse.json({ success: failed === 0, results }, { status: failed && failed === results.length ? 500 : 200 });
}
