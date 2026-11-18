// Row format used by n8n's "Postgres Chat Memory" node (LangChain PostgresChatMessageHistory).
// LangChain stores each message flat: { type, content, additional_kwargs, response_metadata, ... }
// and reads it back by splitting `type` from the rest. A nested { type, data: {...} } shape
// is NOT read correctly, so always build rows with this helper.

export type MemoryRole = 'human' | 'ai';

export function buildMemoryMessage(role: MemoryRole, content: string) {
  const base = {
    type: role,
    content,
    additional_kwargs: {},
    response_metadata: {},
  };
  return role === 'ai' ? { ...base, tool_calls: [], invalid_tool_calls: [] } : base;
}

/** Text the AI sees for a message the human agent sent while the AI was paused. */
export function agentMemoryText(body: string) {
  return `[Human agent from Phone Buzz team replied personally]: ${body}`;
}

/** Text the AI sees for a customer message that arrived while the AI was paused. */
export function customerMemoryText(body: string, type: string, transcript?: string | null) {
  if (transcript) return `[Customer sent ${type}] ${transcript}`;
  return body || `[Customer sent ${type}]`;
}
