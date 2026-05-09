import { Page, Locator } from '@playwright/test';
import { allure } from 'allure-playwright';

export class TelescopePage {
  readonly page: Page;
  readonly asaMenuItem: Locator;
  readonly customReportsMenuItem: Locator;
  readonly generateReportsButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Verified in live DOM: ASA sidebar → Custom Reports menuitem.
    this.asaMenuItem = page.locator('li:has-text("ASA")').first();
    this.customReportsMenuItem = page.locator('h3:has-text("Custom Reports")').first();
    this.generateReportsButton = page.locator('button:has-text("Generate Reports")');
  }

  async openCustomReports() {
    await allure.step('Open Custom Reports from ASA submenu', async () => {
      await this.asaMenuItem.hover();
      await this.customReportsMenuItem.click();
      await this.page.waitForURL(/\/reports(\?|$|\/)/, { timeout: 20_000 });
    });
  }

  async isGenerateReportsButtonVisible(): Promise<boolean> {
    return this.generateReportsButton.isVisible().catch(() => false);
  }
}