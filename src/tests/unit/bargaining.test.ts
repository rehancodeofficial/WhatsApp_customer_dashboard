import { describe, it, expect } from 'vitest';
import { isBargainingMessage } from '@/lib/biz/bargaining';

describe('Bargaining & Discount Request Detection', () => {
  it('detects discount/bargaining queries in Roman Urdu and English', () => {
    expect(isBargainingMessage('kuch kam kardo')).toBe(true);
    expect(isBargainingMessage('kuch kam ho sakta hai?')).toBe(true);
    expect(isBargainingMessage('thori discount mil sakti hai?')).toBe(true);
    expect(isBargainingMessage('rate kam karo')).toBe(true);
    expect(isBargainingMessage('bohot mehnga hai')).toBe(true);
    expect(isBargainingMessage('final price kya hogi?')).toBe(true);
    expect(isBargainingMessage('can you give discount?')).toBe(true);
    expect(isBargainingMessage('any discount on 30 pieces?')).toBe(true);
    expect(isBargainingMessage('paise thode kam kar lo')).toBe(true);

    // Negative cases
    expect(isBargainingMessage('hello, what is the price?')).toBe(false);
    expect(isBargainingMessage('deliver hogya thanks')).toBe(false);
    expect(isBargainingMessage('i sent payment proof')).toBe(false);
  });
});
