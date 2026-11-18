import { test, expect } from '@playwright/test';

/**
 * End-to-end flow, run against the app in DEMO MODE (no Supabase needed):
 * customer message -> AI replies -> owner pauses -> customer writes, nobody replies ->
 * owner replies -> owner resumes -> customer writes -> AI replies knowing the owner's message.
 *
 *   npm run build && npm run test:e2e
 */
test('per-customer pause, manual reply and resume with memory', async ({ page, request }) => {
  const wa = `97155${Date.now().toString().slice(-7)}`;
  const simulate = (body: string) => request.post('/api/demo/simulate', { data: { wa_id: wa, body } });

  const first = await (await simulate('Hi, I need 20 iPhone 15')).json();
  expect(first.aiReplied).toBe(true);

  await page.goto('/dashboard');
  await page.getByPlaceholder('Search name, number or message text...').fill(wa);
  await page.getByText(`+${wa}`).first().click();
  await expect(page.getByText('AI Responding')).toBeVisible();

  // Pause the AI for this customer only
  await page.getByText('AI Responding').click();
  await expect(page.getByText('Takeover Active')).toBeVisible();

  const second = await (await simulate('Can you do a discount?')).json();
  expect(second.ai_enabled).toBe(false);
  expect(second.aiReplied).toBe(false);

  // Owner replies personally
  await page.getByPlaceholder('Type WhatsApp reply (Enter to send)...').fill('Best price 3,700 for 20 pcs');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Best price 3,700 for 20 pcs')).toBeVisible();

  // Resume and check the AI knows what the owner said
  await page.getByText('Takeover Active').click();
  await expect(page.getByText('AI Responding')).toBeVisible();
  const third = await (await simulate('OK deal')).json();
  expect(third.aiReplied).toBe(true);
  await expect(page.getByText(/I have the context from our team: "Best price 3,700/)).toBeVisible({ timeout: 10000 });
});
