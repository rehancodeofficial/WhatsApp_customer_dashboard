// AI broadcast suggestions.
// 1. The rule engine (logic.ts → suggestProducts) always picks the candidates from real stock, sales
//    pace, margin and customer demand, so a suggestion never names a product that is not in stock.
// 2. When GEMINI_API_KEY is set, Gemini reviews those candidates, re-ranks them and writes the
//    WhatsApp marketing copy. Without a key (or if the call fails) the rule-based copy is used.
import type { ProductSuggestion } from './logic';

export interface SuggestionResult {
  suggestions: (ProductSuggestion & { aiNote?: string })[];
  source: 'gemini' | 'rules';
  error?: string;
}

export function aiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT =
  'You are the sales assistant of Phone Buzz FZCO, a B2B wholesale mobile phone trader in Dubai. ' +
  'The owner wants to send a WhatsApp broadcast to past customers to move stock. ' +
  'From the candidate products (facts below, from the live inventory), pick the best 1-3 to broadcast now, best first. ' +
  'Only use product_ids from the list. Never invent prices, stock or discounts: a discount may be at most max_discount_pct. ' +
  'Write each message for wholesale buyers: short, clear price per piece, units available, a call to reply with quantity. ' +
  'Start the message with "Hi {name}," ({name} is replaced per customer). Plain text, at most 3 emojis. ' +
  'Respond with ONLY valid JSON in this exact shape: {"picks":[{"product_id":"...","why":"one sentence for the owner","message":"the WhatsApp text under 600 chars"}]}';

export async function suggestWithAI(candidates: ProductSuggestion[]): Promise<SuggestionResult> {
  if (!candidates.length || !aiConfigured()) return { suggestions: candidates, source: 'rules' };

  const facts = candidates.map((c) => ({
    product_id: c.product_id,
    product: c.product,
    stock_units: c.stock,
    price: `${c.currency} ${c.sale_price}`,
    max_discount_pct: c.suggestedDiscountPct,
    audience_size: c.audienceSize,
    signals: c.reasons,
  }));

  try {
    const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(facts) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return { suggestions: candidates, source: 'rules', error: 'GEMINI_API_KEY is invalid or unauthorised' };
    }
    if (res.status === 429) {
      return { suggestions: candidates, source: 'rules', error: 'AI is busy (rate limited), showing rule-based picks' };
    }
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      return { suggestions: candidates, source: 'rules', error: `Gemini error ${res.status}: ${err.slice(0, 200)}` };
    }

    const json = await res.json();
    const rawText: string =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let picks: { product_id: string; why: string; message: string }[] = [];
    try {
      picks = JSON.parse(rawText).picks ?? [];
    } catch {
      // Gemini sometimes wraps JSON in markdown fences
      const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) picks = JSON.parse(match[1]).picks ?? [];
    }

    const byId = new Map(candidates.map((c) => [c.product_id, c]));
    const out = picks
      .filter((p) => byId.has(p.product_id))
      .map((p) => ({ ...byId.get(p.product_id)!, message: p.message.slice(0, 1000), aiNote: p.why }));

    if (!out.length) return { suggestions: candidates, source: 'rules', error: 'The AI returned no usable picks' };
    return { suggestions: out, source: 'gemini' };
  } catch (e: any) {
    return { suggestions: candidates, source: 'rules', error: e?.message || 'AI request failed' };
  }
}
