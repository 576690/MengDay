import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', channel: 'msedge' },
  projects: [
    { name: 'desktop', testIgnore: '**/pwa.spec.ts', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      testIgnore: '**/pwa.spec.ts',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
    {
      name: 'pwa',
      testMatch: '**/pwa.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173' },
    },
  ],
  webServer: [
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
    { command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
  ],
});
