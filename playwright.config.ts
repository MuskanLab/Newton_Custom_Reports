import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,        // Serial — suite is state-dependent
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  
  // Auto-generate and open Allure report after tests complete
  globalTeardown: process.env.SKIP_ALLURE_OPEN ? undefined : './global-teardown.ts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['allure-playwright', {
      detail: true,
      suiteTitle: false,
      outputFolder: 'allure-results',
    }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://preprod.newtonco.ai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    acceptDownloads: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});