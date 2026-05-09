import { test as base, Page, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config/env';

type Fx = { sharedPage: Page };

const STORAGE_STATE = path.resolve('./test-data/.auth/state.json');

export const test = base.extend<Fx>({
  context: async ({ browser }, use) => {
    const storageExists = fs.existsSync(STORAGE_STATE);
    const ctx = await browser.newContext({
      acceptDownloads: true,
      storageState: storageExists ? STORAGE_STATE : undefined,
    });
    await use(ctx);
    await ctx.close();
  },
  sharedPage: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
export { STORAGE_STATE };