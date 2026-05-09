import { test, expect } from '../fixtures/base-fixture';
import { allure } from 'allure-playwright';
import { config } from '../config/env';
import { ReportsPage } from '../pages/report.page';
import { ReportDownloadPage } from '../pages/report-download.page';
import * as fs from 'fs';
import { REPORT_TYPES, reportDisplayName } from '../data/metric-definitions';

test.describe.serial('Use Case 5 — Download reports', () => {
  test('download all 4 generated reports', async ({ sharedPage: page }) => {
    await allure.suite('UC5 Report Download');

    const reports = new ReportsPage(page);
    await reports.goto(config.applicationUrl);

    const downloader = new ReportDownloadPage(page);
    fs.mkdirSync(config.downloadDir, { recursive: true });

    for (const key of REPORT_TYPES) {
      const name = reportDisplayName(config.reportName, key);
      const saved = await downloader.downloadReportByName(name, config.downloadDir);
      expect(fs.existsSync(saved), `Expected saved file ${saved}`).toBeTruthy();
      expect(fs.statSync(saved).size).toBeGreaterThan(0);
      await page.waitForTimeout(1500);
    }
  });
});