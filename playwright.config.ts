import { defineConfig } from '@playwright/test';

// E2E runs the production build in demo mode on port 3200 (no Supabase / WhatsApp needed).
export default defineConfig({
  testDir: 'src/tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3200', trace: 'off' },
  webServer: {
    command: 'npx next start -p 3200',
    url: 'http://localhost:3200/api/health',
    reuseExistingServer: true,
    env: { NEXT_PUBLIC_DEMO_MODE: 'true' },
  },
});
