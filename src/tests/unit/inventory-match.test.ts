import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/biz/sheet-store', () => ({ readRows: vi.fn(), resolveTab: (s: string) => s, writeRow: vi.fn() }));
vi.mock('@/lib/biz/sheet-sync', () => ({ resolveSheet: vi.fn(), syncRows: vi.fn() }));
vi.mock('@/lib/biz/inventory-sync', () => ({ watchInventory: vi.fn() }));
vi.mock('@/lib/config', () => ({ checkN8nSecret: () => true }));
import { readRows } from '@/lib/biz/sheet-store';
import { GET } from '@/app/api/n8n/sheet/[sheet]/route';

const rows = [{ ID: 'INV-0001', Brand: 'Apple', Model: 'iPhone 15 Pro', Storage: '', Color: '', Grade: 'A', Available_Qty: 70, Sale_Price: 1150, Stock_Status: 'In Stock' }];
const call = async (qs: string) => {
  (readRows as any).mockResolvedValue(rows);
  const req: any = { headers: new Headers(), nextUrl: new URL('http://x/api/n8n/sheet/Inventory' + qs) };
  return (await GET(req, { params: Promise.resolve({ sheet: 'Inventory' }) })).json();
};

describe('inventory matching for the AI', () => {
  it('never returns a different phone', async () => {
    const r = await call('?model=iPhone%20X&storage=128GB&grade=A&color=Black');
    expect(r).toHaveLength(1);
    expect(r[0].In_Stock).toBe(false);
    expect(r[0].Note).toMatch(/NOT IN STOCK/);
  });
  it('returns the matching phone with the converted price', async () => {
    const r = await call('?model=Apple%20iPhone%2015%20Pro&grade=A&currency=PKR&rate=276&decimals=0');
    expect(r[0].ID).toBe('INV-0001');
    expect(r[0].Customer_Price_Per_Piece).toBe(317400);
  });
  it('returns everything when no model is asked', async () => {
    expect(await call('')).toHaveLength(1);
  });
});
