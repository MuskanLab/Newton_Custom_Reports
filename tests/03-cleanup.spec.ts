import { test, expect } from '../fixtures/base-fixture';
import { allure } from 'allure-playwright';
import { config } from '../config/env';
import { ReportsPage } from '../pages/report.page';
import * as fs from 'fs';
import * as path from 'path';

function purgeDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    const stat = fs.lstatSync(p);
    if (stat.isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
    } else {
      fs.unlinkSync(p);
    }
  }
}

test.describe.serial('Use Case 3 — Cleanup (fresh start)', () => {
  // Per-row delete + dialog confirm scales linearly with the number of reports.
  // 50+ reports comfortably fit inside 10 minutes.
  test.setTimeout(10 * 60_000);

  test('clean everything', async ({ sharedPage: page }) => {
    await allure.suite('UC3 Cleanup');

    await allure.step(`Purge ${config.downloadDir}`, async () => purgeDir(config.downloadDir));
    await allure.step(`Purge ${config.dataDir}`,     async () => purgeDir(config.dataDir));

    const reports = new ReportsPage(page);
    await reports.goto(config.applicationUrl);
    await reports.verifyPageLoaded();

    const before = await reports.getTotalCount().catch(() => 0);
    const deleted = await reports.deleteAllReports();

    // Lightweight reload — `networkidle` can hang on this SPA.
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await reports.verifyPageLoaded();
    const after = await reports.getTotalCount().catch(() => 0);

    console.log(`[cleanup] reports before=${before}, deleted=${deleted}, after=${after}`);
    expect(after, 'all reports should be deleted').toBe(0);
  });
});