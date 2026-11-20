// Sequential record IDs, the same way the n8n workflow makes them (highest number + 1):
//   suppliers SUP-001, SUP-002, ...   inventory INV-0001, INV-0002, ...
import { readRows } from './sheet-store';

function next(prefix: string, width: number, codes: (string | null | undefined)[]) {
  const re = new RegExp('^' + prefix + '-?(\\d+)$', 'i');
  const max = codes.reduce((m, c) => {
    const x = String(c ?? '').trim().match(re);
    return x ? Math.max(m, Number(x[1])) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}

export async function nextSupplierCode(existing: (string | null | undefined)[]) {
  const sheet = await readRows('Suppliers').catch(() => []);
  return next('SUP', 3, [...existing, ...sheet.map((r) => r.Supplier_ID as string)]);
}

export async function nextInventoryId(existing: (string | null | undefined)[]) {
  const sheet = await readRows('Inventory').catch(() => []);
  return next('INV', 4, [...existing, ...sheet.map((r) => r.ID as string)]);
}

/** Sort helper: SUP-002 before SUP-010; rows without an ID go last. */
export function byCode(a?: string | null, b?: string | null) {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true });
}
