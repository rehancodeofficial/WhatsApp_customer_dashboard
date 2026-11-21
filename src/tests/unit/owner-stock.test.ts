import { describe, expect, it } from 'vitest';
import { missingStockDetails, normalizeGrade, parseStockItems } from '@/lib/biz/owner-stock';

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

describe('grades and missing details', () => {
  it('maps grades to A+, A, B, C', () => {
    expect(normalizeGrade('Grade A+')).toBe('A+');
    expect(normalizeGrade('brand new')).toBe('A+');
    expect(normalizeGrade('b')).toBe('B');
    expect(normalizeGrade('D')).toBe('');
  });
  it('lists what the owner still has to send', () => {
    const full = { brand: 'Apple', model: 'iPhone 18 Pro', storage: '256GB', color: 'Black', grade: 'A+', quantity: 200, unit_cost: 1900, sale_price: 1950 };
    expect(missingStockDetails([full])).toEqual([]);
    const gaps = missingStockDetails([{ ...full, color: '', unit_cost: null as any, grade: 'D' }]);
    expect(gaps[0].missing).toEqual(['color', 'grade (A+, A, B or C)', 'cost price']);
  });
});
