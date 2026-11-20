// One business currency for the whole dashboard (prices in the n8n sheet are in this currency).
// Set NEXT_PUBLIC_CURRENCY in .env.local / Vercel, e.g. PKR or AED.
export const DEFAULT_CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || 'USD').toUpperCase();

// Inventory prices (cost / sale) as kept in the n8n Inventory records are in Pakistani rupees.
// Set INVENTORY_CURRENCY / NEXT_PUBLIC_INVENTORY_CURRENCY to change it.
export const INVENTORY_CURRENCY = (process.env.NEXT_PUBLIC_INVENTORY_CURRENCY || process.env.INVENTORY_CURRENCY || 'PKR').toUpperCase();
