// Owner adds stock by WhatsApp ("STOCK iPhone 15 Pro 256GB Black Grade A 50 pcs cost 1100 sale 1200").
// n8n's Gemini turns the message into items; this file writes them to the Inventory with the next
// sequential ID (INV-0001, INV-0002, ...). The same product (brand, model, storage, color, grade,
// market) gets the quantity added instead of a duplicate row. Prices are kept in USD.
import { readRows, writeRow, type SheetRow } from './sheet-store';
import { syncRows } from './sheet-sync';
import { watchInventory } from './inventory-sync';
import { nextInventoryId } from './ids';
import { getRates, toBase } from '@/lib/fx';
import { INVENTORY_CURRENCY } from '@/lib/currency';

export interface StockItem {
  brand?: string;
  model?: string;
  storage?: string;
  color?: string;
  grade?: string;
  quantity?: number | string;
  unit_cost?: number | string;
  sale_price?: number | string;
  currency?: string;
  warehouse?: string;
  market_region?: string;
  battery_health?: string;
  supplier_id?: string;
  notes?: string;
}

const t = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const key = (s: unknown) => t(s).toLowerCase().replace(/^grade\s*/, '').replace(/\s+/g, '');
const sameProduct = (r: SheetRow, i: StockItem) =>
  ['Brand', 'Model', 'Storage', 'Color', 'Grade'].every((c) => key(r[c]) === key((i as any)[c.toLowerCase()])) &&
  key(r.Market_Region) === key(i.market_region);

/** Pulls the JSON items out of the model's answer (it may wrap them in ``` fences or text). */
export function parseStockItems(aiText: unknown): StockItem[] {
  if (Array.isArray(aiText)) return aiText as StockItem[];
  const s = t(aiText);
  const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const j = JSON.parse(m[0]);
    const items = Array.isArray(j) ? j : Array.isArray(j.items) ? j.items : [j];
    return items.filter((x: unknown) => x && typeof x === 'object');
  } catch {
    return [];
  }
}

export interface StockResult {
  ok: boolean;
  added: { id: string; product: string; quantity: number; merged: boolean; sale_price: number | null }[];
  problems: string[];
  message: string;
}

export async function addOwnerStock(items: StockItem[]): Promise<StockResult> {
  const added: StockResult['added'] = [];
  const problems: string[] = [];
  const rates = items.some((i) => t(i.currency) && t(i.currency).toUpperCase() !== INVENTORY_CURRENCY) ? await getRates(INVENTORY_CURRENCY) : null;
  const usd = (v: unknown, cur: string) => {
    const n = num(v);
    if (n === null) return null;
    const x = toBase(n, cur || INVENTORY_CURRENCY, INVENTORY_CURRENCY, rates);
    return x === null ? null : Math.round(x * 100) / 100;
  };

  await watchInventory('n8n', async () => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    for (const i of items) {
      const brand = t(i.brand);
      const model = t(i.model);
      const qty = Math.round(num(i.quantity) ?? 0);
      const label = [brand, model, t(i.storage), t(i.color), t(i.grade) && 'Grade ' + t(i.grade).replace(/^grade\s*/i, '')].filter(Boolean).join(' ');
      if (!brand || !model) {
        problems.push(`${label || 'An item'}: brand and model are needed`);
        continue;
      }
      if (!qty) {
        problems.push(`${label}: quantity is missing`);
        continue;
      }
      const cur = t(i.currency).toUpperCase();
      const cost = usd(i.unit_cost, cur);
      const sale = usd(i.sale_price, cur);
      if (cur && cur !== INVENTORY_CURRENCY && (num(i.unit_cost) || num(i.sale_price)) && cost === null && sale === null) {
        problems.push(`${label}: no exchange rate for ${cur}, prices not saved`);
      }
      const rows = await readRows('Inventory');
      const same = rows.find((r) => sameProduct(r, i));
      const row: Record<string, unknown> = same
        ? {
            ID: same.ID,
            Available_Qty: (Number(same.Available_Qty) || 0) + qty,
            ...(cost !== null ? { Unit_Cost: cost } : {}),
            ...(sale !== null ? { Sale_Price: sale } : {}),
            Stock_Status: 'In Stock',
            Last_Updated: now,
          }
        : {
            ID: await nextInventoryId(rows.map((r) => r.ID as string)),
            Brand: brand,
            Model: model,
            Storage: t(i.storage),
            Color: t(i.color),
            Grade: t(i.grade).replace(/^grade\s*/i, ''),
            Warehouse: t(i.warehouse),
            Market_Region: t(i.market_region),
            Available_Qty: qty,
            Reserved_Qty: 0,
            Unit_Cost: cost ?? '',
            Sale_Price: sale ?? '',
            Stock_Status: 'In Stock',
            Supplier_ID: t(i.supplier_id).toUpperCase(),
            'Battery Health': t(i.battery_health),
            Notes: t(i.notes),
            Reorder_Level: 0,
            Last_Updated: now,
          };
      const written = await writeRow('Inventory', same ? 'update' : 'append', same ? 'ID' : null, row);
      if (written[0]) {
        const { row_number, ...full } = written[0] as any;
        await syncRows('Inventory' as any, [full]).catch((e) => problems.push(`${label}: saved, dashboard sync failed (${e?.message || e})`));
      }
      added.push({ id: String(row.ID), product: label, quantity: qty, merged: !!same, sale_price: sale ?? (same ? num(same.Sale_Price) : null) });
    }
  });

  const lines = added.map(
    (a) => `${a.merged ? '➕' : '🆕'} ${a.id}: ${a.product}, ${a.merged ? '+' : ''}${a.quantity} pcs${a.sale_price ? `, sale USD ${a.sale_price}` : ''}${a.merged ? ' (added to existing stock)' : ''}`
  );
  const message = added.length
    ? `✅ Stock added to Inventory:\n${lines.join('\n')}${problems.length ? '\n\n⚠️ ' + problems.join('\n⚠️ ') : ''}`
    : `❌ Nothing was added to Inventory.\n${problems.length ? problems.join('\n') + '\n\n' : ''}Send it like:\nSTOCK iPhone 15 Pro 256GB Black Grade A 50 pcs cost 1100 sale 1200`;
  return { ok: added.length > 0, added, problems, message };
}
