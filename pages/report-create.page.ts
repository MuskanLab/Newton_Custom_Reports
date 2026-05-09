import { Page, Locator } from '@playwright/test';
import { allure } from 'allure-playwright';

export class ReportCreatePage {
  readonly page: Page;

  readonly selectAppsDropdown: Locator;
  readonly searchAppsInput: Locator;
  readonly dateRangeInput: Locator;
  readonly customRangeButton: Locator;
  readonly dateRangeApplyButton: Locator;
  readonly dateRangeCancelButton: Locator;
  readonly selectPresetDropdown: Locator;
  readonly selectTemplateDropdown: Locator;
  readonly reportNameInput: Locator;
  readonly descriptionInput: Locator;

  readonly calendarPrevArrow: Locator;
  readonly calendarNextArrow: Locator;
  readonly leftCalendarMonthHeader: Locator;

  readonly dailyCheckbox: Locator;
  readonly weeklyCheckbox: Locator;
  readonly monthlyCheckbox: Locator;

  readonly generateReportButton: Locator;
  readonly cancelButton: Locator;

  readonly setupSection: Locator;
  readonly dimensionSection: Locator;
  readonly metricsSection: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    this.selectAppsDropdown = page.locator('mat-form-field.selectApp mat-select');
    this.searchAppsInput = page.locator('input[placeholder="Search Apps"]');
    this.dateRangeInput = page.locator('#calendar-input');

    // ngx-daterangepicker-material: presets are <li>, NOT <button>.
    this.customRangeButton = page.locator('.ranges li', { hasText: 'Custom range' });
    this.dateRangeApplyButton = page.locator('.md-drppicker .buttons button', {
      hasText: /^\s*Apply\s*$/i,
    });
    this.dateRangeCancelButton = page.locator('.md-drppicker .buttons button', {
      hasText: /^\s*Cancel\s*$/i,
    });

    this.selectPresetDropdown = page.locator('-selecmatt#preset');
    this.selectTemplateDropdown = page.locator('mat-select#template');
    this.reportNameInput = page.locator('#reportname');
    this.descriptionInput = page.locator('#desc');

    this.calendarPrevArrow = page.locator('.calendar.left th.prev.available').first();
    // NOTE: this build never renders a `.next` arrow. Kept for forward-compat only.
    this.calendarNextArrow = page.locator(
      '.calendar.right th.next.available, .calendar th.next.available'
    ).first();
    this.leftCalendarMonthHeader = page.locator('.calendar.left th.month');

    this.dailyCheckbox   = page.locator('mat-checkbox').filter({ has: page.locator('label', { hasText: /^\s*Daily\s*$/ }) });
    this.weeklyCheckbox  = page.locator('mat-checkbox').filter({ has: page.locator('label', { hasText: /^\s*Weekly\s*$/ }) });
    this.monthlyCheckbox = page.locator('mat-checkbox').filter({ has: page.locator('label', { hasText: /^\s*Monthly\s*$/ }) });

    this.generateReportButton = page.locator('button:has-text("Generate Report")').first();
    this.cancelButton = page.locator('button.btn-secondary:has-text("Cancel")');

    this.setupSection     = page.locator('div.form-header', { hasText: 'Setup' });
    this.dimensionSection = page.locator('div.form-header', { hasText: 'Dimension' });
    this.metricsSection   = page.locator('div.form-header', { hasText: 'Metrics' });

    this.successMessage = page.locator('mat-snack-bar-container, .mat-mdc-snack-bar-container, .mdc-snackbar');
  }

  async waitForAppsDropdownReady() {
    await this.selectAppsDropdown.waitFor({ state: 'visible', timeout: 60_000 });
  }

  async searchAndSelectFirstApp(searchText: string) {
    await allure.step(`Search and select app: ${searchText}`, async () => {
      await this.waitForAppsDropdownReady();
      await this.selectAppsDropdown.click();
      await this.searchAppsInput.waitFor({ state: 'visible', timeout: 15_000 });

      // Angular's filter listens for keyup events — fill() alone won't trigger it.
      await this.searchAppsInput.click();
      await this.searchAppsInput.fill('');
      await this.searchAppsInput.pressSequentially(searchText, { delay: 20 });
      await this.page.waitForTimeout(500);

      const match = this.page.locator('mat-option').filter({ hasText: searchText }).first();
      await match.waitFor({ state: 'visible', timeout: 10_000 });
      await match.click();

      // Multi-select: panel stays open after pick — close it explicitly.
      await this.page.keyboard.press('Escape');
      await this.page
        .locator('.cdk-overlay-backdrop')
        .first()
        .waitFor({ state: 'hidden', timeout: 5_000 })
        .catch(() => {});
    });
  }

  async selectCustomDateRangeByDate(
    startMonth: string, startYear: string, startDay: number,
    endMonth: string, endYear: string, endDay: number,
  ) {
    await allure.step(
      `Select date range: ${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`,
      async () => {
        await this.dateRangeInput.click();
        await this.page
          .locator('.md-drppicker.shown')
          .waitFor({ state: 'visible', timeout: 10_000 });

        // "Custom range" is an <li>, not a <button>, in this build.
        await this.customRangeButton.click();
        await this.page.waitForTimeout(400);

        // This build has NO `.next` arrow — only `.prev` on each calendar header.
        // The two calendars navigate independently, so we move each one back
        // until it shows the requested month.
        const monthMatches = (h: string, m: string, y: string) => h.includes(m) && h.includes(y);
        const rightHeader = this.page.locator('.calendar.right th.month');
        const rightPrevArrow = this.page.locator('.calendar.right th.prev.available').first();

        // 1) Navigate LEFT back to startMonth/startYear.
        for (let i = 0; i < 60; i++) {
          const h = ((await this.leftCalendarMonthHeader.textContent()) ?? '').trim();
          if (monthMatches(h, startMonth, startYear)) break;
          await this.calendarPrevArrow.click();
          await this.page.waitForTimeout(180);
        }

        // 2) Pick start day from LEFT, ignoring adjacent-month spillover.
        await this.page
          .locator('.calendar.left td.available:not(.off)', {
            hasText: new RegExp(`^\\s*${startDay}\\s*$`),
          })
          .first()
          .click();
        await this.page.waitForTimeout(200);

        // 3) Decide which calendar holds the end month and navigate if needed.
        const sameMonth = startMonth === endMonth && startYear === endYear;
        let endCalSelector: string;

        if (sameMonth) {
          endCalSelector = '.calendar.left';
        } else {
          // Navigate RIGHT back to endMonth/endYear. RIGHT's `.prev` cannot move
          // it before LEFT — that's fine, we just want endMonth >= startMonth+1.
          for (let i = 0; i < 60; i++) {
            const rh = ((await rightHeader.textContent()) ?? '').trim();
            if (monthMatches(rh, endMonth, endYear)) break;
            if (!(await rightPrevArrow.isVisible().catch(() => false))) break;
            await rightPrevArrow.click();
            await this.page.waitForTimeout(180);
          }

          const lh = ((await this.leftCalendarMonthHeader.textContent()) ?? '').trim();
          const rh = ((await rightHeader.textContent()) ?? '').trim();
          if (monthMatches(rh, endMonth, endYear)) endCalSelector = '.calendar.right';
          else if (monthMatches(lh, endMonth, endYear)) endCalSelector = '.calendar.left';
          else {
            throw new Error(
              `End month ${endMonth} ${endYear} not visible (left=${lh}, right=${rh}). ` +
              `Range must span <=2 consecutive months in this build (no "next" arrow).`
            );
          }
        }

        await this.page
          .locator(`${endCalSelector} td.available:not(.off)`, {
            hasText: new RegExp(`^\\s*${endDay}\\s*$`),
          })
          .first()
          .click();

        await this.dateRangeApplyButton.click();
        await this.page
          .locator('.md-drppicker.shown')
          .waitFor({ state: 'hidden', timeout: 5_000 })
          .catch(() => {});
      }
    );
  }

  async selectPreset(presetName: string) {
    await allure.step(`Select preset: ${presetName}`, async () => {
      const dropdown = this.page.locator('mat-select#preset');
      await dropdown.scrollIntoViewIfNeeded();
      await dropdown.waitFor({ state: 'visible', timeout: 30_000 });

      await this.page
        .locator('.cdk-overlay-backdrop')
        .first()
        .waitFor({ state: 'hidden', timeout: 5_000 })
        .catch(() => {});
      await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

      // Use the deterministic panel id rather than the generic class — avoids
      // false negatives from stale overlays.
      const panel = this.page.locator('#preset-panel');

      let opened = false;
      for (let i = 0; i < 5 && !opened; i++) {
        await dropdown.click({ force: i > 0 });
        try {
          await panel.waitFor({ state: 'visible', timeout: 4_000 });
          opened = true;
        } catch {
          await this.page.keyboard.press('Escape').catch(() => {});
          await this.page.waitForTimeout(800);
        }
      }
      if (!opened) {
        throw new Error('Preset dropdown failed to open after 5 attempts.');
      }

      const exact = panel
        .locator('mat-option', { hasText: new RegExp(`^\\s*${presetName}\\s*$`, 'i') })
        .first();

      if (await exact.count()) {
        await exact.click();
      } else {
        const seen = await panel.locator('mat-option').allInnerTexts();
        throw new Error(
          `Preset "${presetName}" not found. Saw: ${JSON.stringify(seen)}`
        );
      }

      await panel.waitFor({ state: 'hidden', timeout: 5_000 }).catch(async () => {
        await this.page.keyboard.press('Escape').catch(() => {});
      });
    });
  }

  async enterReportName(name: string) { await this.reportNameInput.fill(name); }
  async enterDescription(desc: string) { await this.descriptionInput.fill(desc); }

  private async toggle(cb: Locator, wantChecked: boolean) {
    await cb.scrollIntoViewIfNeeded();
    const input = cb.locator('input[type="checkbox"]');
    const isChecked = await input.isChecked();
    if (isChecked !== wantChecked) await cb.click();
  }
  selectDaily   = () => this.toggle(this.dailyCheckbox,   true);
  selectWeekly  = () => this.toggle(this.weeklyCheckbox,  true);
  selectMonthly = () => this.toggle(this.monthlyCheckbox, true);
  unselectDaily   = () => this.toggle(this.dailyCheckbox,   false);
  unselectWeekly  = () => this.toggle(this.weeklyCheckbox,  false);
  unselectMonthly = () => this.toggle(this.monthlyCheckbox, false);

  async isDailySelected()   { return this.dailyCheckbox.locator('input[type="checkbox"]').isChecked(); }
  async isWeeklySelected()  { return this.weeklyCheckbox.locator('input[type="checkbox"]').isChecked(); }
  async isMonthlySelected() { return this.monthlyCheckbox.locator('input[type="checkbox"]').isChecked(); }

  async clickGenerateReport() {
    await allure.step('Click Generate Report', async () => {
      await this.generateReportButton.scrollIntoViewIfNeeded();
      await this.generateReportButton.click();
      await this.page.waitForTimeout(3000);
    });
  }

  async isRedirectedToReportsListing() {
    try { await this.page.waitForURL(/\/reports(\?|$)/, { timeout: 15_000 }); return true; }
    catch { return false; }
  }
}