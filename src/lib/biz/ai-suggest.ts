// AI broadcast suggestions.
// 1. The rule engine (logic.ts → suggestProducts) always picks the candidates from real stock, sales
//    pace, margin and customer demand, so a suggestion never names a product that is not in stock.
// 2. When CLAUDE_API_KEY is set (the business's own Anthropic API key), Claude reviews those candidates, re-ranks them and writes the
//    WhatsApp marketing copy. Without a key (or if the call fails) the rule-based copy is used.
import Anthropic from '@anthropic-ai/sdk';
import type { ProductSuggestion } from './logic';

export interface SuggestionResult {
  suggestions: (ProductSuggestion & { aiNote?: string })[];
  source: 'claude' | 'rules';
  error?: string;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['picks'],
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['product_id', 'why', 'message'],
        properties: {
          product_id: { type: 'string' },
          why: { type: 'string', description: 'One sentence for the owner: why push this product now.' },
          message: { type: 'string', description: 'The WhatsApp broadcast text, under 600 characters.' },
        },
      },
    },
  },
};

// A dedicated variable (not ANTHROPIC_API_KEY) so the app never picks up a key or proxy URL
// that happens to be in the shell environment of whoever runs the server.
export function aiConfigured() {
  return !!process.env.CLAUDE_API_KEY;
}

export async function suggestWithAI(candidates: ProductSuggestion[]): Promise<SuggestionResult> {
  if (!candidates.length || !aiConfigured()) return { suggestions: candidates, source: 'rules' };
  try {
    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, baseURL: 'https://api.anthropic.com' });
    const facts = candidates.map((c) => ({
      product_id: c.product_id,
      product: c.product,
      stock_units: c.stock,
      price: `${c.currency} ${c.sale_price}`,
      max_discount_pct: c.suggestedDiscountPct,
      audience_size: c.audienceSize,
      signals: c.reasons,
    }));
    const params: any = {
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system:
        'You are the sales assistant of Phone Buzz FZCO, a B2B wholesale mobile phone trader in Dubai. ' +
        'The owner wants to send a WhatsApp broadcast to past customers to move stock. ' +
        'From the candidate products (facts below, from the live inventory), pick the best 1-3 to broadcast now, best first. ' +
        'Only use product_ids from the list. Never invent prices, stock or discounts: a discount may be at most max_discount_pct. ' +
        'Write each message for wholesale buyers: short, clear price per piece, units available, a call to reply with quantity. ' +
        'Start the message with "Hi {name}," ({name} is replaced per customer). Plain text, at most 3 emojis.',
      messages: [{ role: 'user', content: JSON.stringify(facts) }],
    };
    const res: any = await client.beta.messages.create(params);
    if (res.stop_reason === 'refusal') throw new Error('The AI declined this request');
    const text = (res.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const picks: { product_id: string; why: string; message: string }[] = JSON.parse(text).picks || [];
    const byId = new Map(candidates.map((c) => [c.product_id, c]));
    const out = picks
      .filter((p) => byId.has(p.product_id))
      .map((p) => ({ ...byId.get(p.product_id)!, message: p.message.slice(0, 1000), aiNote: p.why }));
    if (!out.length) return { suggestions: candidates, source: 'rules', error: 'The AI returned no usable picks' };
    return { suggestions: out, source: 'claude' };
  } catch (e: any) {
    if (e instanceof Anthropic.AuthenticationError) return { suggestions: candidates, source: 'rules', error: 'CLAUDE_API_KEY is invalid' };
    if (e instanceof Anthropic.RateLimitError) return { suggestions: candidates, source: 'rules', error: 'AI is busy (rate limited), showing rule-based picks' };
    return { suggestions: candidates, source: 'rules', error: e?.message || 'AI request failed' };
  }
}
