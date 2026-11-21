import { describe, expect, it } from 'vitest';
import { parseStockItems } from '@/lib/biz/owner-stock';

describe('parseStockItems', () => {
  it('reads items from a fenced model answer', () => {
    const ai = '```json\n{"items":[{"brand":"Apple","model":"iPhone 15 Pro","storage":"256GB","quantity":50,"sale_price":1200}]}\n```';
    expect(parseStockItems(ai)).toEqual([{ brand: 'Apple', model: 'iPhone 15 Pro', storage: '256GB', quantity: 50, sale_price: 1200 }]);
  });
  it('accepts a bare array and an items array', () => {
    expect(parseStockItems([{ brand: 'Samsung', model: 'S24' }])).toHaveLength(1);
    expect(parseStockItems('[{"brand":"A","model":"B"},{"brand":"C","model":"D"}]')).toHaveLength(2);
  });
  it('returns nothing for text without JSON', () => {
    expect(parseStockItems('sorry, no idea')).toEqual([]);
    expect(parseStockItems('{bad json')).toEqual([]);
  });
});
