import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRepo, resetDemoStore, demoMemory } from '@/lib/repo/memory';
import { buildMemoryMessage, agentMemoryText } from '@/lib/memory-format';
import { isPauseExpired } from '@/lib/repo/logic';

const owner = { id: null, role: 'owner' as const };
let n = 0;
const inbound = (repo: MemoryRepo, wa_id: string, body: string) =>
  repo.ingestInbound({ wa_id, wa_message_id: `wamid.t${++n}`, type: 'text', body });

describe('per-customer AI pause / resume', () => {
  let repo: MemoryRepo;
  beforeEach(() => {
    resetDemoStore();
    repo = new MemoryRepo();
  });

  it('a new customer starts with the AI on', async () => {
    const r = await inbound(repo, '971550000001', 'Hi');
    expect(r.ai_enabled).toBe(true);
    expect(r.mode).toBe('ai');
  });

  it('pausing one customer never affects another', async () => {
    const a = await inbound(repo, '971550000001', 'Hi from A');
    const b = await inbound(repo, '971550000002', 'Hi from B');
    await repo.setMode(a.conversation_id, 'human', null, 'test', null);

    expect((await inbound(repo, '971550000001', 'Still there?')).ai_enabled).toBe(false);
    expect((await inbound(repo, '971550000002', 'Price?')).ai_enabled).toBe(true);
    expect(b.conversation_id).not.toBe(a.conversation_id);
  });

  it('resuming turns the AI back on for that customer', async () => {
    const a = await inbound(repo, '971550000001', 'Hi');
    await repo.setMode(a.conversation_id, 'human', null, 'pause', null);
    await repo.setMode(a.conversation_id, 'ai', null, 'resume', null);
    expect((await inbound(repo, '971550000001', 'Hello again')).ai_enabled).toBe(true);
    const detail = await repo.getConversation(owner, a.conversation_id);
    expect(detail!.events.map((e) => e.to_mode)).toEqual(['ai', 'human']); // newest first
  });

  it('messages during a pause go into the AI memory, so the AI has context on resume', async () => {
    const a = await inbound(repo, '971550000001', 'Hi');
    await repo.setMode(a.conversation_id, 'human', null, 'pause', null);
    await inbound(repo, '971550000001', 'Can you do 980 per piece?');
    await repo.appendMemory('971550000001', 'ai', agentMemoryText('OK, 1000 final if you pay today'));

    const mem = demoMemory('971550000001').map((m) => m.message as any);
    expect(mem).toEqual([
      buildMemoryMessage('human', 'Can you do 980 per piece?'),
      buildMemoryMessage('ai', agentMemoryText('OK, 1000 final if you pay today')),
    ]);
  });

  it('does not write customer messages to memory while the AI is on (n8n saves those itself)', async () => {
    await inbound(repo, '971550000003', 'Hi');
    expect(demoMemory('971550000003')).toHaveLength(0);
  });

  it('a timed pause resumes by itself when it runs out', async () => {
    const a = await inbound(repo, '971550000001', 'Hi');
    await repo.setMode(a.conversation_id, 'human', null, 'pause 30m', new Date(Date.now() - 1000).toISOString());
    const r = await inbound(repo, '971550000001', 'Hello?');
    expect(r.ai_enabled).toBe(true);
  });

  it('retried webhooks do not create duplicate messages', async () => {
    const first = await repo.ingestInbound({ wa_id: '971550000009', wa_message_id: 'wamid.same', type: 'text', body: 'Hi' });
    const again = await repo.ingestInbound({ wa_id: '971550000009', wa_message_id: 'wamid.same', type: 'text', body: 'Hi' });
    expect(again.duplicate).toBe(true);
    const detail = await repo.getConversation(owner, first.conversation_id);
    expect(detail!.messages).toHaveLength(1);
  });

  it('delivery ticks never go backwards', async () => {
    await inbound(repo, '971550000001', 'Hi');
    await repo.logOutbound({ wa_id: '971550000001', wa_message_id: 'wamid.out1', type: 'text', body: 'Hello', sender_type: 'ai' });
    await repo.updateStatus({ wa_message_id: 'wamid.out1', status: 'read' });
    const m = await repo.updateStatus({ wa_message_id: 'wamid.out1', status: 'delivered' });
    expect(m!.status).toBe('read');
  });

  it('search finds chats by message text and by number', async () => {
    await inbound(repo, '971550000077', 'Need Pixel 9 Pro');
    expect((await repo.listConversations(owner, { q: 'pixel 9' })).map((c) => c.contact?.wa_id)).toContain('971550000077');
    expect((await repo.listConversations(owner, { q: '+971 55 000 0077' })).length).toBe(1);
  });

  it('isPauseExpired only fires for paused chats with a past resume time', () => {
    expect(isPauseExpired({ mode: 'ai', resume_at: new Date(0).toISOString() })).toBe(false);
    expect(isPauseExpired({ mode: 'human', resume_at: null })).toBe(false);
    expect(isPauseExpired({ mode: 'human', resume_at: new Date(0).toISOString() })).toBe(true);
  });
});
