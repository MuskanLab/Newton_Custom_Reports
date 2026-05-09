import { Page, Locator, expect } from '@playwright/test';
import { allure } from 'allure-playwright';

/**
 * Reports listing page (/reports).
 * Verified against live DOM on 2026-04-18:
 * - It's a Material `<mat-table>` (NOT a classic `<table>`).
 * - Rows are `<mat-row>`; cells are `<mat-cell>` with `cdk-column-*` classes.
 * - Each row's action cell has 3 buttons in order: share / download / trash.
 * - Bulk Action button is `disabled` until at least one row is checked.
 * - Paginator: 10 per page, total may span multiple pages.
 */
export class ReportsPage {
  readonly page: Page;
  readonly reportsTable: Locator;
  readonly reportRows: Locator;
  readonly selectAllCheckbox: Locator;
  readonly generateReportsButton: Locator;
  readonly actionBulkButton: Locator;
  readonly paginatorRangeLabel: Locator;
  readonly paginatorFirstPageBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.reportsTable = page.locator('mat-table');
    this.reportRows = page.locator('mat-row.mat-mdc-row');

    this.selectAllCheckbox = page.locator('input[type="checkbox"][aria-label="select all"]');
    this.generateReportsButton = page.locator('button.primaryBtn', { hasText: /^\s*Generate Reports\s*$/ });
    this.actionBulkButton = page.locator('button.mat-mdc-menu-trigger', { hasText: /^\s*Action\s*$/ }).first();

    this.paginatorRangeLabel = page.locator('.mat-mdc-paginator-range-label');
    this.paginatorFirstPageBtn = page.locator('button[aria-label="First page"]');
  }

  async goto(baseUrl: string) {
    await this.page.goto(baseUrl + '/reports', { waitUntil: 'networkidle' });
  }

  async verifyPageLoaded() {
    await expect(this.page).toHaveURL(/\/reports(\?|$|\/)/);
    await expect(this.generateReportsButton).toBeVisible();
  }

  rowByReportName(reportName: string): Locator {
    return this.reportRows.filter({
      has: this.page.locator('mat-cell.mat-column-report_name', { hasText: reportName }),
    });
  }

  /** Action cell layout: [0] share, [1] download, [2] trash. */
  shareButtonInRow(reportName: string): Locator {
    return this.rowByReportName(reportName).locator('mat-cell.mat-column-action button').nth(0);
  }
  downloadButtonInRow(reportName: string): Locator {
    return this.rowByReportName(reportName).locator('mat-cell.mat-column-action button').nth(1);
  }
  deleteButtonInRow(reportName: string): Locator {
    return this.rowByReportName(reportName).locator('mat-cell.mat-column-action button').nth(2);
  }

  async getAllReportNames(): Promise<string[]> {
    const cells = this.page.locator('mat-cell.mat-column-report_name em');
    const texts = await cells.allTextContents();
    return texts.map((t) => t.trim()).filter(Boolean);
  }

  async countRows(): Promise<number> {
    return this.reportRows.count();
  }

  /** Reads "1 – 10 of 47" → 47.  Returns 0 if no paginator/no rows. */
  async getTotalCount(): Promise<number> {
    if (!(await this.paginatorRangeLabel.isVisible().catch(() => false))) {
      return await this.countRows().catch(() => 0);
    }
    const text = (await this.paginatorRangeLabel.textContent())?.trim() ?? '';
    const m = text.match(/of\s+(\d+)/i);
    return m ? Number(m[1]) : 0;
  }

  async clickGenerateReports() {
    await this.generateReportsButton.click();
    await this.page.waitForURL(/\/reports\/create/, { timeout: 15_000 });
  }

  /**
   * Deletes EVERY report on /reports by repeatedly clicking the trash icon
   * on the first visible row, until the table is empty across all pages.
   *
   * Bulk delete via select-all + Action menu would be faster, but the Action
   * button is disabled until rows are selected and the menu structure isn't
   * known yet — per-row trash is reliable and self-paginating (Material
   * paginator auto-loads the next page once the current one empties).
   */
  async deleteAllReports(): Promise<number> {
    return await allure.step('Delete all reports', async () => {
      let deleted = 0;
      const HARD_LIMIT = 1000;
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 3;
      // Track whether the app shows a confirm dialog. We probe on the first
      // delete and skip the wait on subsequent ones if it never appeared.
      let dialogSeen: boolean | null = null;

      if (await this.paginatorFirstPageBtn.isEnabled().catch(() => false)) {
        await this.paginatorFirstPageBtn.click();
        await this.page.waitForTimeout(500);
      }

      while (deleted < HARD_LIMIT) {
        const remainingBefore = await this.reportRows.count().catch(() => 0);
        if (remainingBefore === 0) break;

        const result = await this.deleteFirstRow(dialogSeen);
        
        if (!result.ok) {
          consecutiveFailures += 1;
          console.log(`[cleanup] delete attempt failed, consecutive failures: ${consecutiveFailures}`);
          
          // If a single row fails, try refreshing and continuing
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.log('[cleanup] too many consecutive failures, refreshing page...');
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.generateReportsButton
              .waitFor({ state: 'visible', timeout: 15_000 })
              .catch(() => {});
            await this.page.waitForTimeout(1000);
            
            const afterReload = await this.reportRows.count().catch(() => 0);
            if (afterReload === 0) break;
            
            // Reset and try again after reload
            consecutiveFailures = 0;
            continue;
          }
          
          // Wait a bit and retry
          await this.page.waitForTimeout(1000);
          continue;
        }
        
        // Success - reset failure counter
        consecutiveFailures = 0;
        if (dialogSeen === null) dialogSeen = result.dialogSeen;

        deleted += 1;

        // Wait for the table to actually shrink (or paginator to refill).
        // This is much faster than a flat sleep when the backend is quick,
        // and safer when it's slow.
        await this.page
          .waitForFunction(
            (prev) => document.querySelectorAll('mat-row.mat-mdc-row').length !== prev,
            remainingBefore,
            { timeout: 10_000 },
          )
          .catch(() => {});

        // Small buffer for any animations/transitions
        await this.page.waitForTimeout(300);

        // Edge case: when deleting the LAST report, the table sometimes keeps
        // the stale row in the DOM until the page is refreshed. If we just
        // tried to delete a single remaining row and it's still there, reload
        // the page and re-check before treating it as a failure.
        if (remainingBefore === 1) {
          const stillThere = await this.reportRows.count().catch(() => 0);
          if (stillThere > 0) {
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await this.generateReportsButton
              .waitFor({ state: 'visible', timeout: 15_000 })
              .catch(() => {});
            const afterReload = await this.reportRows.count().catch(() => 0);
            if (afterReload === 0) break;
          }
        }
      }

      return deleted;
    });
  }

  private async deleteFirstRow(
    dialogSeen: boolean | null,
  ): Promise<{ ok: boolean; dialogSeen: boolean }> {
    const firstRow = this.reportRows.first();
    if (!(await firstRow.isVisible().catch(() => false))) return { ok: false, dialogSeen: false };

    // Try multiple strategies to find the delete/trash button:
    // 1. Third button in action column (original assumption)
    // 2. Button with trash/delete icon
    // 3. Button with delete-related aria-label or title
    const trashButtonStrategies = [
      firstRow.locator('mat-cell.mat-column-action button').nth(2),
      firstRow.locator('mat-cell.mat-column-action button').last(),
      firstRow.locator('button[aria-label*="delete" i], button[aria-label*="trash" i], button[aria-label*="remove" i]').first(),
      firstRow.locator('button[title*="delete" i], button[title*="trash" i], button[title*="remove" i]').first(),
      firstRow.locator('button:has(mat-icon:text-matches("delete|trash|remove", "i"))').first(),
      firstRow.locator('mat-cell button mat-icon').filter({ hasText: /delete|trash/i }).locator('..'),
    ];

    let trashBtn = null;
    for (const strategy of trashButtonStrategies) {
      if (await strategy.isVisible().catch(() => false)) {
        trashBtn = strategy;
        break;
      }
    }

    if (!trashBtn) {
      console.log('[cleanup] could not find trash button in first row');
      return { ok: false, dialogSeen: false };
    }

    try {
      await trashBtn.scrollIntoViewIfNeeded();
      await trashBtn.click();
    } catch (err) {
      console.log('[cleanup] click failed:', err);
      return { ok: false, dialogSeen: false };
    }

    // First call: probe up to 2s for a dialog. After that we know the answer
    // and can use a much shorter probe (or skip entirely).
    const probeTimeout = dialogSeen === null ? 2_000 : dialogSeen ? 4_000 : 250;
    const seen = await this.confirmDeleteDialog(probeTimeout);
    return { ok: true, dialogSeen: dialogSeen ?? seen };
  }

  /** Dismisses a confirm dialog if one appears. Returns true if one was seen. */
  private async confirmDeleteDialog(probeTimeoutMs: number): Promise<boolean> {
    const dialog = this.page
      .locator('mat-dialog-container, .mat-mdc-dialog-container, [role="dialog"], .modal, .swal2-popup')
      .first();

    if (!(await dialog.isVisible({ timeout: probeTimeoutMs }).catch(() => false))) return false;

    const confirmBtn = dialog
      .locator('button')
      .filter({ hasText: /^\s*(delete|yes|confirm|ok|remove)\s*$/i })
      .first();

    if (await confirmBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await confirmBtn.click();
    } else {
      await this.page.keyboard.press('Enter').catch(() => {});
    }

    await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    return true;
  }
}
