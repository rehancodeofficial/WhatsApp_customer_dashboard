// Owner notifications: helpers shared by the n8n endpoint and the UI.
export function titleFromText(text: string) {
  const first = text.split('\n').map((l) => l.trim()).find(Boolean) || 'Notification';
  // "🔔 SUPPLIER AVAILABILITY REQUEST" → "Supplier availability request"
  const clean = first.replace(/[^\p{L}\p{N}\s().,:#/+-]/gu, '').replace(/\s+/g, ' ').trim();
  const sentence = clean === clean.toUpperCase() ? clean.charAt(0) + clean.slice(1).toLowerCase() : clean;
  return sentence.slice(0, 120) || 'Notification';
}

export function classifyNotification(text: string) {
  const t = text.toLowerCase();
  if (/could not|error|failed|not found|problem|not answered|not classified/.test(t)) return 'error';
  if (/payment|verified|paid/.test(t)) return 'payment';
  if (/supplier|quote|target|deal|delivered/.test(t)) return 'supplier';
  if (/order|ord-/.test(t)) return 'order';
  if (/human handling|ai paused|handoff|handed over/.test(t)) return 'handoff';
  return 'info';
}

export const NOTIFICATION_TYPES: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'orange' }> = {
  handoff: { label: 'Needs you', color: 'amber' },
  order: { label: 'Order', color: 'orange' },
  payment: { label: 'Payment', color: 'green' },
  supplier: { label: 'Supplier', color: 'blue' },
  error: { label: 'Problem', color: 'red' },
  security: { label: 'Security', color: 'red' },
  info: { label: 'Info', color: 'gray' },
};
