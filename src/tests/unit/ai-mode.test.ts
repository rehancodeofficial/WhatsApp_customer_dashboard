import { describe, it, expect } from 'vitest';
import { InboundMessageSchema, SetModeSchema, SendMessageSchema } from '@/lib/validations';

describe('AI Mode & Payload Validation Logic', () => {
  it('validates inbound message from n8n correctly', () => {
    const validPayload = {
      wa_id: '971501234567',
      wa_message_id: 'wamid.HBgLOTcxNTAxMjM0NTY3',
      name: 'Tariq Al Mansoori',
      profile_name: 'Tariq',
      country: 'UAE',
      preferred_language: 'en',
      lead_id: 'LEAD-101',
      lead_status: 'Interested in iPhone 15',
      type: 'text',
      body: 'Do you have iPhone 15 Pro Max available in stock?',
    };

    const result = InboundMessageSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wa_id).toBe('971501234567');
      expect(result.data.type).toBe('text');
    }
  });

  it('rejects invalid wa_id in inbound payload', () => {
    const invalidPayload = {
      wa_id: '123', // too short for E.164 phone number
      wa_message_id: 'wamid.123',
    };
    const result = InboundMessageSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('validates mode transition payload for taking over conversation (human mode)', () => {
    const takeover = {
      mode: 'human',
      reason: 'Sales rep answering custom pricing query',
      resume_in_minutes: 60,
    };
    const result = SetModeSchema.safeParse(takeover);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('human');
      expect(result.data.resume_in_minutes).toBe(60);
    }
  });

  it('validates resuming AI mode payload', () => {
    const resume = {
      mode: 'ai',
      reason: 'Owner concluded manual agreement, handing back to AI',
    };
    const result = SetModeSchema.safeParse(resume);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('ai');
    }
  });

  it('validates sending manual agent message', () => {
    const validSend = {
      conversation_id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'text',
      body: 'Hello Sami, I can provide 50 units at AED 3,850 each.',
    };
    const result = SendMessageSchema.safeParse(validSend);
    expect(result.success).toBe(true);
  });
});
