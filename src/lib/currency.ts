// One business currency for the whole dashboard (defaults strictly to USD).
// Set NEXT_PUBLIC_CURRENCY in .env.local / Vercel to override if ever needed.
export const DEFAULT_CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || 'USD').toUpperCase();

// Inventory prices (cost / sale) are kept in US dollars (USD).
// Set INVENTORY_CURRENCY / NEXT_PUBLIC_INVENTORY_CURRENCY to change it.
export const INVENTORY_CURRENCY = (process.env.NEXT_PUBLIC_INVENTORY_CURRENCY || process.env.INVENTORY_CURRENCY || 'USD').toUpperCase();
