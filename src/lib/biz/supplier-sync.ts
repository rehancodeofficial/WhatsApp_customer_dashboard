// Keeps the AI's supplier record (sheet_rows "Suppliers", read by n8n) in step with dashboard edits.
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { upsertByKey } from './sheet-store';
import type { Supplier } from './types';

export async function pushSupplier(s: Supplier) {
  if (isDemoMode() || !s.code) return;
  await upsertByKey('Suppliers', 'Supplier_ID', {
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
