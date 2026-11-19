// Keeps the n8n Inventory sheet in step with the dashboard and alerts the owner on WhatsApp
// when a product runs out of stock or is deleted.
//
//  - Dashboard edits (any role): the changed rows are written to the Inventory tab of sheet_rows
//    (the dashboard's copy of the old Google Sheet), so the AI sees the new stock at once.
//  - n8n edits (supplier delivery confirmed, stock reserved, ...): arrive through
//    /api/n8n/sheet/Inventory; they only trigger the alerts (sheet_rows already has them).
import { canSendRealWhatsApp, isDemoMode, OWNER_WHATSAPP_NUMBER } from '@/lib/config';
import { upsertByKey } from './sheet-store';
import { sendMetaWhatsAppMessage } from '@/lib/whatsapp';
import { getBizStore } from './store';
import type { Product } from './types';

export type InventorySource = 'dashboard' | 'n8n';

const available = (p: Product) => Math.max(0, (p.stock_qty || 0) - (p.reserved_qty || 0));
const label = (p: Product) => [p.brand, p.model, p.storage, p.color, p.grade && `Grade ${p.grade}`].filter(Boolean).join(' ') || p.sku;

/** Row in the same columns as the Inventory sheet (matched by ID). */
async function sheetRow(p: Product, deleted = false) {
  let supplierCode = '';
  if (p.supplier_id) {
    const s = (await getBizStore().listSuppliers()).find((x) => x.id === p.supplier_id);
    supplierCode = s?.code || '';
  }
  return {
    ID: p.sku,
    Brand: p.brand || '',
    Model: p.model || '',
    Storage: p.storage || '',
    Color: p.color || '',
    Grade: p.grade || '',
    Available_Qty: deleted || !p.active ? 0 : available(p),
    Reserved_Qty: deleted ? 0 : p.reserved_qty || 0,
    Unit_Cost: p.cost_price ?? '',
    Sale_Price: p.sale_price ?? '',
    Reorder_Level: p.reorder_level ?? '',
    Warehouse: p.location || '',
    Market_Region: p.market_region || '',
    Supplier_ID: supplierCode,
    Notes: deleted ? `Deleted from dashboard ${new Date().toISOString().slice(0, 10)}` : p.notes || '',
  };
}

async function pushToSheet(p: Product, deleted = false) {
  if (isDemoMode() || !p.sku) return;
  const row = await sheetRow(p, deleted);
  await upsertByKey('Inventory', 'ID', {
    ...row,
    Stock_Status: Number(row.Available_Qty) > 0 ? 'In Stock' : 'Out of Stock',
    Last_Updated: new Date().toISOString().replace('T', ' ').slice(0, 19),
  });
}

/** Bell notification in the dashboard + WhatsApp message to the owner (sent by n8n). */
export async function alertOwner(title: string, text: string, type = 'inventory') {
  await getBizStore()
    .upsertRow<any>('notifications', null, { type, title, body: text, wa_id: null, party: null, order_no: null, request_code: null, read_at: null })
    .catch((e) => console.error('notification insert failed', e));
  if (!OWNER_WHATSAPP_NUMBER || !canSendRealWhatsApp()) return;
  await sendMetaWhatsAppMessage({ to: OWNER_WHATSAPP_NUMBER, type: 'text', text: `*${title}*\n\n${text}` }).catch((e) =>
    console.error('owner WhatsApp alert failed', e?.message || e)
  );
}

/** Compare stock before/after a change: push changed rows to the sheet and alert on sold-out. */
export async function reconcileInventory(before: Product[], after: Product[], source: InventorySource) {
  const old = new Map(before.map((p) => [p.id, p]));
  const tasks: Promise<unknown>[] = [];
  for (const p of after) {
    const o = old.get(p.id);
    const changed =
      !o ||
      o.stock_qty !== p.stock_qty ||
      (o.reserved_qty || 0) !== (p.reserved_qty || 0) ||
      o.sale_price !== p.sale_price ||
      o.cost_price !== p.cost_price ||
      o.active !== p.active ||
      o.brand !== p.brand ||
      o.model !== p.model ||
      (o.storage || '') !== (p.storage || '') ||
      (o.color || '') !== (p.color || '') ||
      (o.grade || '') !== (p.grade || '') ||
      (o.location || '') !== (p.location || '') ||
      (o.notes || '') !== (p.notes || '');
    if (!changed) continue;
    if (source === 'dashboard') tasks.push(pushToSheet(p).catch((e) => console.error('inventory sheet sync failed', p.sku, e?.message || e)));
    if (o && available(o) > 0 && available(p) <= 0 && p.active) {
      tasks.push(
        alertOwner(
          `Out of stock: ${label(p)}`,
          `${label(p)} (ID ${p.sku}) is now out of stock.\nOn hand: ${p.stock_qty}, reserved: ${p.reserved_qty || 0}.\nUpdated from the ${source === 'n8n' ? 'WhatsApp automation' : 'dashboard'}.`
        )
      );
    }
  }
  await Promise.all(tasks);
}

export async function onProductDeleted(p: Product) {
  await Promise.all([
    pushToSheet(p, true).catch((e) => console.error('inventory sheet delete failed', p.sku, e?.message || e)),
    alertOwner(
      `Product deleted: ${label(p)}`,
      `${label(p)} (ID ${p.sku}) was deleted from the dashboard inventory.\nIt had ${p.stock_qty} on hand. The AI will not offer it any more.`
    ),
  ]);
}

/** Runs `fn` and then reconciles every product whose stock or details changed. */
export async function watchInventory<T>(source: InventorySource, fn: () => Promise<T>): Promise<T> {
  const store = getBizStore();
  const before = await store.listProducts().catch(() => null);
  const result = await fn();
  if (before) {
    try {
      await reconcileInventory(before, await store.listProducts(), source);
    } catch (e) {
      console.error('inventory reconcile failed', e);
    }
  }
  return result;
}
