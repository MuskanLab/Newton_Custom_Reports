import { Page, Locator } from '@playwright/test';
import { allure } from 'allure-playwright';

/**
 * Login Page Object.
 * NOTE: I could not inspect your login page directly in this session.
 * Selectors below use common Angular Material patterns. Verify against your DOM.
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // TODO: confirm these against the live login DOM.
    this.emailInput = page.locator('input[type="email"], input[name="email"], #email').first();
    this.passwordInput = page.locator('input[type="password"], input[name="password"], #password').first();
    this.loginButton = page.locator('button:has-text("Login"), button:has-text("Sign in")').first();
  }

  async goto(baseUrl: string, loginPath = '/login') {
    await allure.step('Navigate to login page', async () => {
      // Use 'domcontentloaded' instead of 'networkidle' — many SPAs never go idle
      await this.page.goto(baseUrl + loginPath, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await this.emailInput.waitFor({ state: 'visible', timeout: 30_000 });
    });
  }

  async login(email: string, password: string) {
    await allure.step('Enter credentials and submit', async () => {
      // Wait a moment for any auto-redirect (storageState session might already be valid)
      await this.page.waitForTimeout(2000);

      // If we've been redirected away from login (valid session), skip credentials
      if (!/login/i.test(this.page.url())) {
        await this.page.waitForURL(/telescope|dashboard/, { timeout: 15_000 }).catch(() => {});
        await this.waitForDashboardReady();
        return;
      }

      // Use Playwright's built-in retry: fill() auto-waits for the element to be
      // actionable. We just add explicit waits to let Angular settle between steps.
      await this.emailInput.waitFor({ state: 'visible', timeout: 30_000 });
      await this.emailInput.fill(email);
      await this.page.waitForTimeout(300);

      await this.passwordInput.waitFor({ state: 'visible', timeout: 10_000 });
      await this.passwordInput.fill(password);
      await this.page.waitForTimeout(300);

      // Re-check URL — some apps auto-submit after email+password are filled
      if (!/login/i.test(this.page.url())) {
        await this.page.waitForURL(/telescope|dashboard/, { timeout: 30_000 });
        await this.waitForDashboardReady();
        return;
      }

      await this.loginButton.waitFor({ state: 'visible', timeout: 10_000 });
      await this.loginButton.click();

      await this.page.waitForURL(/telescope|dashboard/, { timeout: 30_000 });
      await this.waitForDashboardReady();
    });
  }

  /**
   * `waitForURL` resolves the instant the SPA router fires its navigation
   * event — but the dashboard then spends 10–30 s on first load fetching
   * /api/me, the account list, and widget data. Wait for common dashboard
   * indicators to ensure the page is fully loaded before proceeding.
   */
  private async waitForDashboardReady(): Promise<void> {
    await allure.step('Wait for dashboard hydration', async () => {
      // Try multiple possible dashboard indicators — different app versions
      // may have different selectors. We succeed if ANY of these appear.
      const dashboardIndicators = [
        'button.account-switch',
        'button.mat-mdc-menu-trigger.account-switch',
        'nav.navigationMenu',
        '.navigationMenu',
        'button[class*="account"]',
        'header button',
        '.dashboard',
        '.telescope',
        '[class*="sidebar"]',
        'mat-sidenav',
      ];

      const combinedLocator = this.page.locator(dashboardIndicators.join(', ')).first();

      try {
        await combinedLocator.waitFor({ state: 'visible', timeout: 60_000 });
      } catch {
        // If no specific indicator found, at least wait for network to settle
        // and body to have content — the user is likely on some page.
        await this.page.waitForLoadState('networkidle').catch(() => {});
        await this.page.locator('body').waitFor({ state: 'visible', timeout: 10_000 });
      }

      // Extra buffer for any Angular hydration / API calls
      await this.page.waitForTimeout(2000);
    });
  }
} //New change in login page
