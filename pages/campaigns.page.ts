import { Page, Locator, expect } from '@playwright/test';
import { allure } from 'allure-playwright';

export class CampaignsPage {
  readonly page: Page;

  readonly campaignGroupDropdown: Locator;   // opener button
  readonly campaignGroupPanel:    Locator;   // the panel that appears
  readonly campaignGroupSearch:   Locator;   // search input inside the panel
  readonly campaignGroupOptions:  Locator;   // all label rows

  constructor(page: Page) {
    this.page = page;

    // Opener: the button under the "Campaign Group" label.
    // Scoping to its wrapper (#orglist) guarantees we don't hit the App or Campaign buttons.
    this.campaignGroupDropdown = page.locator('#orglist button.dropdownBtnSec');
    this.campaignGroupPanel    = page.locator('#_inorgDropdown');
    this.campaignGroupSearch   = page.locator('#orgsrchInput');
    this.campaignGroupOptions  = this.campaignGroupPanel.locator('label.chkLbl');
  }

  async selectCampaignGroup(name: string) {
    await allure.step(`Select Campaign Group: ${name}`, async () => {
      // 1. Open the dropdown
      await this.campaignGroupDropdown.scrollIntoViewIfNeeded();
      await this.campaignGroupDropdown.click();

      // 2. Wait for the panel to be visible
      await this.campaignGroupPanel.waitFor({ state: 'visible', timeout: 10_000 });
      await this.campaignGroupSearch.waitFor({ state: 'visible', timeout: 5_000 });

      // 3. Type the search term with real keystrokes so Angular's filter fires
      await this.campaignGroupSearch.click();
      await this.campaignGroupSearch.fill('');            // clear any previous query
      await this.campaignGroupSearch.pressSequentially(name, { delay: 25 });

      // 4. Wait for the matching row and click it
      const match = this.campaignGroupOptions.filter({ hasText: new RegExp(name, 'i') }).first();
      await match.waitFor({ state: 'visible', timeout: 5_000 });
      await match.click();

      // 5. Panel auto-closes on selection; if it didn't, close it
      await this.campaignGroupPanel.waitFor({ state: 'hidden', timeout: 5_000 }).catch(async () => {
        await this.page.keyboard.press('Escape');
      });

      // 6. Verify the opener now shows the chosen value
      await expect(this.campaignGroupDropdown).toContainText(new RegExp(name, 'i'));
    });
  }
}
