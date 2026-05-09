import { test, expect } from '../fixtures/base-fixture';
import { allure } from 'allure-playwright';
import { config } from '../config/env';
import { ReportCreatePage } from '../pages/report-create.page';

const variants = [
  { key: 'Daily',            applyDim: (p: ReportCreatePage) => p.selectDaily() },
  { key: 'Weekly',           applyDim: (p: ReportCreatePage) => p.selectWeekly() },
  { key: 'Monthly',          applyDim: (p: ReportCreatePage) => p.selectMonthly() },
  { key: 'NoTimeDimension',  applyDim: async (p: ReportCreatePage) => {
      await p.unselectDaily(); await p.unselectWeekly(); await p.unselectMonthly();
    } },
];

test.describe.serial('Use Case 4 — Create 4 reports', () => {
  for (const v of variants) {
    test(`generate report with ${v.key}`, async ({ sharedPage: page }) => {
      await allure.suite('UC4 Report Create');
      await allure.severity('critical');

      await page.goto(config.applicationUrl + config.reportCreatePath, { waitUntil: 'networkidle' });

      const rc = new ReportCreatePage(page);
      await rc.searchAndSelectFirstApp(config.reportAppSearchText);
      await rc.selectCustomDateRangeByDate(
        config.dateRange.startMonth, config.dateRange.startYear, config.dateRange.startDay,
        config.dateRange.endMonth,   config.dateRange.endYear,   config.dateRange.endDay,
      );
      await rc.selectPreset(config.presetOption);
      await rc.enterReportName(`${config.reportName} - ${v.key}`);
      await rc.enterDescription(config.reportDescription);

      await v.applyDim(rc);
      await rc.clickGenerateReport();

      expect(await rc.isRedirectedToReportsListing()).toBeTruthy();
    });
  }
});