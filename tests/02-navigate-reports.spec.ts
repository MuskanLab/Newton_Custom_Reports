import { test, expect } from '../fixtures/base-fixture';
import { allure } from 'allure-playwright';
import { config } from '../config/env';
import { ReportsPage } from '../pages/report.page';

test.describe.serial('Use Case 2 — Navigate to Reports', () => {
  test('open Custom Reports page and verify listing', async ({ sharedPage: page }) => {
    await allure.suite('UC2 Navigate Reports');
    await allure.severity('critical');

    // Go directly to /reports (storageState has auth cookies, no need to go via telescope)
    await page.goto(config.applicationUrl + '/reports', { waitUntil: 'networkidle' });

    const reports = new ReportsPage(page);
    await reports.verifyPageLoaded();
    await expect(page).toHaveURL(/\/reports(\?|$|\/)/);
  });
});