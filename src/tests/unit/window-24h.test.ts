import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get24HourWindowStatus, formatMetaError } from '@/lib/whatsapp';

describe('WhatsApp Meta 24-Hour Messaging Window Logic', () => {
  const RealDateNow = Date.now;

  beforeEach(() => {
    // Mock current time to 2026-11-19T03:00:00.000Z
    const fixedNow = new Date('2026-11-19T03:00:00.000Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks window as closed when customer has never sent a message', () => {
    const status = get24HourWindowStatus(null);
    expect(status.isOpen).toBe(false);
    expect(status.remainingMs).toBe(0);
    expect(status.remainingFormatted).toContain('Closed');
  });

  it('marks window as open when customer messaged 2 hours ago', () => {
    // 2 hours ago
    const twoHoursAgo = new Date('2026-11-19T01:00:00.000Z').toISOString();
    const status = get24HourWindowStatus(twoHoursAgo);

    expect(status.isOpen).toBe(true);
    expect(status.remainingMs).toBe(22 * 60 * 60 * 1000); // 22 hours left
    expect(status.remainingFormatted).toBe('22h 0m left');
  });

  it('marks window as closed when customer messaged 24.5 hours ago', () => {
    // 24.5 hours ago
    const pastWindow = new Date('2026-11-18T02:30:00.000Z').toISOString();
    const status = get24HourWindowStatus(pastWindow);

    expect(status.isOpen).toBe(false);
    expect(status.remainingMs).toBeLessThanOrEqual(0);
    expect(status.remainingFormatted).toContain('Template required');
  });

  it('formats Meta error code 131047 with human-friendly explanation', () => {
    const formatted = formatMetaError('131047');
    expect(formatted).toContain('24-hour window expired');
    expect(formatted).toContain('Send an approved template');
  });
});
