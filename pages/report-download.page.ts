import { Page, Locator, Download } from '@playwright/test';
import { ReportsPage } from './report.page';
import * as fs from 'fs';
import * as path from 'path';

export class ReportDownloadPage {
  readonly page: Page;
  readonly reports: ReportsPage;

  constructor(page: Page) {
    this.page = page;
    this.reports = new ReportsPage(page);
  }

  async downloadReportByName(reportName: string, destDir: string): Promise<string> {
    fs.mkdirSync(destDir, { recursive: true });

    // Make sure the row actually exists before clicking, otherwise we'll
    // silently hang on `waitForEvent('download')`. If it's not on page 1,
    // walk through paginator pages until found.
    await this.findRowAcrossPages(reportName);

    const dlBtn: Locator = this.reports.downloadButtonInRow(reportName);
    await dlBtn.scrollIntoViewIfNeeded();
    await dlBtn.waitFor({ state: 'visible', timeout: 15_000 });

    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 120_000 }),
      dlBtn.click(),
    ]);
    const suggested = download.suggestedFilename();
    const filePath = path.join(destDir, suggested);
    await download.saveAs(filePath);
    return filePath;
  }

  private async findRowAcrossPages(reportName: string): Promise<void> {
    const row = this.reports.rowByReportName(reportName);
    const anyRow = this.page.locator('mat-row.mat-mdc-row').first();
    const nextPage = this.page.locator('button[aria-label="Next page"]');

    // Wait for the table to actually hydrate before deciding the row is missing.
    // Right after Create -> goto('/reports'), mat-table renders empty for a
    // moment while the data request is in flight.
    await anyRow.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});

    for (let i = 0; i < 50; i++) {
      // Use waitFor with a short timeout instead of isVisible() — handles
      // virtual scrolling / re-render after pagination clicks.
      const found = await row
        .first()
        .waitFor({ state: 'visible', timeout: 4_000 })
        .then(() => true)
        .catch(() => false);
      if (found) return;

      const canPaginate = await nextPage.isEnabled().catch(() => false);
      if (!canPaginate) break;
      await nextPage.click();
      await this.page.waitForTimeout(500);
    }

    throw new Error(`Report "${reportName}" not found on /reports.`);
  }
}