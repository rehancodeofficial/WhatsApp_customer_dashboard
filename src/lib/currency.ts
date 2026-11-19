// One business currency for the whole dashboard (prices in the n8n sheet are in this currency).
// Set NEXT_PUBLIC_CURRENCY in .env.local / Vercel, e.g. PKR or AED.
export const DEFAULT_CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || 'AED').toUpperCase();
