// Keeps the AI's supplier record (sheet_rows "Suppliers", read by n8n) in step with dashboard edits.
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { upsertByKey } from './sheet-store';
import type { Supplier } from './types';

export interface SupplierExtras {
  city?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  markets?: string | null;
}

export async function pushSupplier(s: Supplier, extras: SupplierExtras = {}) {
  if (isDemoMode() || !s.code) return;
  const more: Record<string, unknown> = {};
  if (extras.city !== undefined) more.City = extras.city || '';
  if (extras.address !== undefined) more.Address = extras.address || '';
  if (extras.payment_terms !== undefined) more.Payment_Terms = extras.payment_terms || '';
  if (extras.markets !== undefined) more.Markets = extras.markets || '';
  await upsertByKey('Suppliers', 'Supplier_ID', {
    ...more,
    Supplier_ID: s.code,
    Supplier: s.name || '',
    Company_Name: s.company || '',
    Contact_Person: s.contact_person || '',
    WhatsApp_Number: String(s.phone || '').replace(/[^0-9]/g, ''),
    Email: s.email || '',
    Country: s.country || '',
    Brands: (s.brands || []).join(', '),
    Preferred_Language: s.preferred_language || '',
    Is_Active: s.active !== false,
  }).catch((e) => console.error('supplier sheet sync failed', s.code, e?.message || e));
}

export async function removeSupplier(code: string | null | undefined) {
  if (isDemoMode() || !code) return;
  const db = getAdminSupabase();
  await db.from('sheet_rows').delete().eq('sheet', 'Suppliers').eq('data->>Supplier_ID', code);
  // Inventory rows that pointed at this supplier no longer have one.
  const { data } = await db.from('sheet_rows').select('id, data').eq('sheet', 'Inventory').eq('data->>Supplier_ID', code);
  for (const r of data || []) await db.from('sheet_rows').update({ data: { ...r.data, Supplier_ID: '' } }).eq('id', r.id);
}

/** City / address / payment terms / markets for each supplier code, from the AI's supplier record. */
export async function supplierExtras(): Promise<Map<string, Required<SupplierExtras>>> {
  const out = new Map<string, Required<SupplierExtras>>();
  if (isDemoMode()) return out;
  const { data } = await getAdminSupabase().from('sheet_rows').select('data').eq('sheet', 'Suppliers');
  for (const r of data || []) {
    const d = r.data as Record<string, unknown>;
    const code = String(d.Supplier_ID || '');
    if (!code) continue;
    const t = (v: unknown) => (v == null ? '' : String(v));
    out.set(code, { city: t(d.City), address: t(d.Address), payment_terms: t(d.Payment_Terms), markets: t(d.Markets) });
  }
  return out;
}
