// Exchange rates for the analytics: orders come in the customer's currency (PKR, AED, ...) and are
// added up in the dashboard currency. Same free source the n8n workflow uses. Cached for 6 hours.
const g = globalThis as unknown as { __pbFx?: { base: string; at: number; rates: Record<string, number> } };
const TTL = 6 * 60 * 60 * 1000;

export async function getRates(base: string): Promise<Record<string, number> | null> {
  const b = base.toUpperCase();
  if (g.__pbFx && g.__pbFx.base === b && Date.now() - g.__pbFx.at < TTL) return g.__pbFx.rates;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(b)}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const d = await res.json();
    if (d?.result !== 'success' || !d.rates) throw new Error('bad rates');
    g.__pbFx = { base: b, at: Date.now(), rates: d.rates };
    return d.rates;
  } catch {
    return g.__pbFx && g.__pbFx.base === b ? g.__pbFx.rates : null; // last known rates, or none
  }
}

/** amount in `from` → base currency. null when the rate is unknown. */
export function toBase(amount: number, from: string | null | undefined, base: string, rates: Record<string, number> | null): number | null {
  const f = (from || base).toUpperCase();
  if (f === base.toUpperCase()) return amount;
  const r = rates?.[f];
  return r && r > 0 ? amount / r : null;
}
