import { z } from 'zod';
import type { Permission } from '@/lib/permissions';

const str = (max = 200) => z.string().trim().max(max);
const optStr = (max = 200) => str(max).nullable().optional().transform((v) => (v === '' ? null : v));
const brands = z.array(str(40)).max(30);
const money = z.coerce.number().min(0).max(100_000_000);

export const CustomerBody = z.object({
  wa_id: z.string().transform((v) => v.replace(/[^0-9]/g, '')).pipe(z.string().min(7, 'Enter a WhatsApp number with country code').max(16)),
  name: optStr(100),
  email: optStr(150),
  company: optStr(150),
  country: optStr(80),
  city: optStr(80),
  preferred_language: optStr(40),
  lead_status: optStr(60),
  tags: z.array(str(30)).max(20).optional(),
  notes: optStr(2000),
  payment_tier: z.enum(['high', 'medium', 'low']).nullable().optional(),
  preferred_brands: brands.optional(),
  marketing_opt_in: z.boolean().optional(),
});
export const CustomerPatch = CustomerBody.omit({ wa_id: true }).partial();

export const SupplierBody = z.object({
  name: str(150).min(1, 'Enter a name'),
  company: optStr(150),
  phone: optStr(30),
  email: optStr(150),
  country: optStr(80),
  brands: brands.optional(),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  notes: optStr(2000),
  active: z.boolean().optional(),
});
export const SupplierPatch = SupplierBody.partial();

export const ProductBody = z.object({
  sku: str(60).min(1, 'Enter a SKU'),
  brand: str(60).min(1, 'Enter a brand'),
  model: str(120).min(1, 'Enter a model'),
  variant: optStr(120),
  condition: z.enum(['new', 'refurbished', 'used']).optional(),
  category: str(60).optional(),
  cost_price: money,
  sale_price: money,
  currency: str(5).optional(),
  reorder_level: z.coerce.number().int().min(0).max(1_000_000).optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  location: optStr(120),
  active: z.boolean().optional(),
  /** Only on create: opening stock, recorded as a stock-in movement. */
  opening_stock: z.coerce.number().int().min(0).max(10_000_000).optional(),
});
export const ProductPatch = ProductBody.omit({ opening_stock: true }).partial();

export const MovementBody = z.object({
  product_id: z.string().uuid(),
  type: z.enum(['in', 'out', 'adjustment', 'return']),
  quantity: z.coerce.number().int().refine((n) => n !== 0, 'Quantity cannot be 0'),
  unit_cost: money.nullable().optional(),
  reference: optStr(80),
  note: optStr(300),
});

export const OrderBody = z.object({
  contact_id: z.string().uuid().nullable(),
  status: z.enum(['pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled']).optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid', 'refunded']).optional(),
  discount: money.optional(),
  notes: optStr(2000),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid().nullable(),
        description: str(200).min(1),
        quantity: z.coerce.number().int().min(1).max(1_000_000),
        unit_price: money,
      })
    )
    .min(1, 'Add at least one item')
    .max(100),
});
export const OrderPatch = z.object({
  status: z.enum(['pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled']).optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid', 'refunded']).optional(),
  notes: optStr(2000),
});

export const AudienceBody = z.object({
  countries: z.array(str(80)).max(100).optional(),
  tiers: z.array(z.enum(['high', 'medium', 'low'])).max(3).optional(),
  brands: z.array(str(40)).max(50).optional(),
  optedInOnly: z.boolean().optional(),
});

export const BroadcastBody = z.object({
  title: str(120).min(1, 'Enter a title'),
  message: z.string().trim().min(5, 'Write the message').max(1000),
  product_ids: z.array(z.string().uuid()).max(10),
  filters: AudienceBody,
  contact_ids: z.array(z.string().uuid()).min(1, 'Select at least one customer').max(1000),
  template_name: optStr(120),
  template_language: optStr(10),
  ai_suggested: z.boolean().optional(),
});

/** Which permission reads / writes each record type. */
export const ENTITY_PERMS: Record<string, { view: Permission; manage: Permission }> = {
  customers: { view: 'customers.view', manage: 'customers.manage' },
  products: { view: 'inventory.view', manage: 'inventory.manage' },
  inventory: { view: 'inventory.view', manage: 'inventory.manage' },
  suppliers: { view: 'suppliers.view', manage: 'suppliers.manage' },
  orders: { view: 'orders.view', manage: 'orders.manage' },
};

export function zodMessage(e: z.ZodError) {
  const i = e.issues[0];
  return i ? `${i.path.join('.') || 'input'}: ${i.message}` : 'Invalid input';
}
