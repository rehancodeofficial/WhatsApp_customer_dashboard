// DEMO MODE ONLY: stands in for the n8n AI Sales Agent so the pause/resume flow can be tried
// without n8n. It reads the same memory the real AI would get and shows that it saw the
// human agent's messages.
import { getRepo } from '@/lib/repo';
import { demoMemory } from '@/lib/repo/memory';

export async function demoAiReply(wa_id: string, customerText: string, recordCustomer = true) {
  const repo = getRepo();
  const memory = demoMemory(wa_id).map((m: any) => m.message);
  const humanLines = memory.filter((m: any) => m.type === 'ai' && String(m.content).startsWith('[Human agent'));
  const lastHuman = humanLines.at(-1)?.content?.replace(/^\[[^\]]+\]:\s*/, '');
  const reply = lastHuman
    ? `(Demo AI) I have the context from our team: "${lastHuman}". About your message "${customerText}", how else can I help?`
    : `(Demo AI) Thanks for your message: "${customerText}". How many pieces do you need?`;
  if (recordCustomer) await repo.appendMemory(wa_id, 'human', customerText);
  await repo.appendMemory(wa_id, 'ai', reply);
  return repo.logOutbound({ wa_id, wa_message_id: `wamid.demo_ai_${Date.now()}`, type: 'text', body: reply, sender_type: 'ai' });
}
