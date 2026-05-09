import { Page, Locator, expect } from '@playwright/test';
import { allure } from 'allure-playwright';

/**
 * /asa/campaign-management page (a.k.a. /campaigns).
 *
 * Verified against the live DOM on 2026-04-18:
 *   - Filter bar = 3 custom <button class="dropdownBtnSec"> in order:
 *       [0] Campaign Group   [1] App   [2] Campaign
 *     Each opens div.cdropdown.SearchDropdown with a search input
 *     (#orgsrchInput / #csrchInput / #campsrchInput2) and
 *     <label class="chkLbl"> rows wrapping a hidden checkbox.
 *   - Apply: button.applyfilter.mdc-button--unelevated
 *   - Date range: same ngx-daterangepicker-material library as /reports/create,
 *     bound to input#calendar-input.
 *   - Totals: 8 KPI cards <div class="metrics-box color1..color8">
 *     There is NO totals row in a table — these cards ARE the UI source
 *     of truth for aggregated values.
 */
export class CampaignManagementPage {
  readonly page: Page;

  // Filter bar (positional — there are exactly 3 of these, in this order).
  readonly filterButtons: Locator;
  readonly campaignGroupButton: Locator;
  readonly appButton: Locator;
  readonly campaignButton: Locator;
  readonly applyFiltersButton: Locator;

  // Date range picker
  readonly dateRangeInput: Locator;
  readonly customRangePreset: Locator;
  readonly dateRangeApplyButton: Locator;
  readonly leftCalendarMonthHeader: Locator;
  readonly rightCalendarMonthHeader: Locator;
  readonly leftCalendarPrevArrow: Locator;
  readonly rightCalendarPrevArrow: Locator;

  // KPI cards (legacy — kept for back-compat with extractTotals()).
  readonly metricCards: Locator;

  // Campaign table footer — the "Totals" row at the bottom of the grid.
  // This is the canonical UI source of truth for CSV-vs-UI validation
  // (the KPI cards at the top use slightly different formulas, e.g.
  // "Avg. Daily Spends" instead of "Avg Daily Cost").
  readonly campaignTable: Locator;
  readonly tableFooterRow: Locator;

  // Campaign Group filter — scoped to its own wrapper (#orglist) so we never
  // hit the App or Campaign buttons by accident.
  readonly campaignGroupDropdown: Locator;
  readonly campaignGroupPanel: Locator;
  readonly campaignGroupSearch: Locator;
  readonly campaignGroupOptions: Locator;

  constructor(page: Page) {
    this.page = page;

    this.filterButtons = page.locator('button.dropdownBtnSec');
    this.campaignGroupButton = this.filterButtons.nth(0);
    this.appButton = this.filterButtons.nth(1);
    this.campaignButton = this.filterButtons.nth(2);
    this.applyFiltersButton = page.locator('button.applyfilter').first();

    this.campaignGroupDropdown = page.locator('#orglist button.dropdownBtnSec');
    this.campaignGroupPanel    = page.locator('#_inorgDropdown');
    this.campaignGroupSearch   = page.locator('#orgsrchInput');
    this.campaignGroupOptions  = this.campaignGroupPanel.locator('label.chkLbl');

    this.dateRangeInput = page.locator('input#calendar-input');
    // Presets here include "This Month" / "Last Month" — pick by exact text.
    this.customRangePreset = page.locator('.ranges li', { hasText: /^\s*Custom range\s*$/i });
    this.dateRangeApplyButton = page.locator('.md-drppicker .buttons button', {
      hasText: /^\s*Apply\s*$/i,
    });
    this.leftCalendarMonthHeader = page.locator('.calendar.left th.month');
    this.rightCalendarMonthHeader = page.locator('.calendar.right th.month');
    this.leftCalendarPrevArrow = page.locator('.calendar.left th.prev.available').first();
    this.rightCalendarPrevArrow = page.locator('.calendar.right th.prev.available').first();

    this.metricCards = page.locator('div.metrics-box');

    this.campaignTable = page.locator('mat-table, table.mat-mdc-table').first();
    this.tableFooterRow = page.locator('mat-footer-row.mat-mdc-footer-row').first();
  }

  async goto(baseUrl: string, path = '/campaigns') {
    await allure.step(`Navigate to ${path}`, async () => {
      await this.page.goto(baseUrl + path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // The page redirects /asa/campaign-management -> /campaigns. Just wait for
      // the filter bar to render rather than relying on networkidle.
      await this.campaignGroupButton.waitFor({ state: 'visible', timeout: 30_000 });
    });
  }

  /**
   * Pick an option from the filter-bar dropdown at index `triggerIndex`
   * (0=Campaign Group, 1=App, 2=Campaign per the live DOM).
   *
   * Strategy (independent of any internal input IDs which seem unstable):
   *   1. Click trigger nth(i)
   *   2. Wait for ANY visible div.cdropdown.SearchDropdown
   *   3. (optional) Type the search value, click "Uncheck All" to deselect
   *      anything pre-checked, then clear the search so the option list
   *      is fully repopulated before we filter again
   *   4. Type the search value again
   *   5. Click the label.chkLbl matching `value`
   *   6. Close by clicking the trigger again
   *
   * The uncheck-all step is necessary on filters where the dropdown defaults
   * to "all selected" — ticking our value would otherwise *add* to the
   * selection rather than make it the only selected item.
   *
   * Returns true if a value was picked, false if option missing or panel
   * never opened (caller decides whether to fail or fall back to defaults).
   */
  private async pickFromFilterDropdown(opts: {
    triggerIndex: number;
    value: string;
    label: string;
    required?: boolean;
    uncheckAllFirst?: boolean;
    /**
     * Optional CSS selector to target this dropdown's specific search input.
     * Tried first; falls back to the generic `input[matinput]` inside the
     * panel if not found. Use this when the global generic match would
     * accidentally pick up the wrong input (e.g., the chart-area filters).
     */
    searchInputSelector?: string;
  }): Promise<boolean> {
    return await allure.step(`Pick ${opts.label}: ${opts.value}`, async () => {
      const trigger = this.filterButtons.nth(opts.triggerIndex);
      if (!(await trigger.count())) {
        const msg = `${opts.label} trigger button (nth=${opts.triggerIndex}) does not exist.`;
        if (opts.required) throw new Error(msg);
        console.warn(`[campaign] ${msg}`);
        return false;
      }

      await trigger.scrollIntoViewIfNeeded();
      const triggerLabel = ((await trigger.textContent()) ?? '').trim();
      console.log(`[campaign] opening ${opts.label} dropdown (button text: "${triggerLabel}")`);

      // Open
      await trigger.click();
      const panel = this.page.locator('div.cdropdown.SearchDropdown').filter({ visible: true }).first();
      const opened = await panel
        .waitFor({ state: 'visible', timeout: 6_000 })
        .then(() => true)
        .catch(() => false);

      if (!opened) {
        const msg = `${opts.label} dropdown panel did not open after clicking trigger nth=${opts.triggerIndex}.`;
        if (opts.required) throw new Error(msg);
        console.warn(`[campaign] ${msg}`);
        return false;
      }

      // Resolve the search input. If the caller provided a specific selector
      // (e.g. "#srchInput2" for Campaign Group) try that at page level first
      // — these inputs are sometimes rendered outside div.cdropdown.
      // SearchDropdown's subtree, so a panel-scoped lookup misses them.
      const resolveSearchInput = async (): Promise<Locator | null> => {
        if (opts.searchInputSelector) {
          const explicit = this.page.locator(opts.searchInputSelector).first();
          if (await explicit.count()) return explicit;
          console.warn(
            `[campaign] search input "${opts.searchInputSelector}" not found, falling back to generic`
          );
        }
        const generic = panel.locator('input[matinput], input[placeholder*="Search" i]').first();
        return (await generic.count()) ? generic : null;
      };

      const searchInput = await resolveSearchInput();

      const typeSearch = async (text: string) => {
        if (!searchInput) return;
        await searchInput.click().catch(() => {});
        await searchInput.fill('').catch(() => {});
        if (text) {
          await searchInput.pressSequentially(text, { delay: 20 }).catch(() => {});
        }
        await this.page.waitForTimeout(400);
      };

      // Optional uncheck-all dance: search -> click "Uncheck All" -> clear search.
      // The button is <label class="chkAll">Uncheck All</label> when items are
      // selected and toggles to "Check All" when none are. It lives outside
      // the SearchDropdown panel itself (in a sibling action bar), so we
      // scope to page-level visible elements rather than the panel.
      // We only click when the visible text is "Uncheck All" so we never
      // *add* selections.
      if (opts.uncheckAllFirst) {
        await typeSearch(opts.value);

        // The page renders TWO label.chkAll elements ("Check All" + "Uncheck All")
        // and Angular toggles which one is visually shown via parent CSS.
        // Playwright's :visible check often fails on these (transient animation
        // state, transform: scale(0), or zero-height parent), so we skip it
        // and click via JS — the same code path Angular uses for real clicks.
        const clicked = await this.page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll('label.chkAll'));
          for (const el of labels) {
            const text = (el.textContent ?? '').trim();
            if (/^uncheck/i.test(text)) {
              (el as HTMLElement).click();
              return text;
            }
          }
          return null;
        });

        if (clicked) {
          console.log(`[campaign] clicked "${clicked}" in ${opts.label} panel via JS`);
          await this.page.waitForTimeout(400);
        } else {
          console.warn(
            `[campaign] no <label.chkAll> with text starting "Uncheck" found — proceeding without deselect`
          );
        }

        // Clear the search so the option list refills before we filter again.
        await typeSearch('');
      }

      // Type the search value and pick the matching option.
      await typeSearch(opts.value);

      // Look for option labels in the panel first; if none, fall back to
      // page-level visible labels (some dropdowns render their items outside
      // the SearchDropdown subtree).
      let labels = panel.locator('label.chkLbl');
      if (!(await labels.count().catch(() => 0))) {
        labels = this.page.locator('label.chkLbl').filter({ visible: true });
      }

      const exact = labels.filter({
        hasText: new RegExp(`^\\s*${escapeRegex(opts.value)}\\s*$`, 'i'),
      });
      const target = (await exact.count())
        ? exact.first()
        : labels.filter({ hasText: opts.value }).first();

      let picked = false;
      if (await target.count()) {
        await target.click();
        picked = true;
      } else {
        const seen = await labels.allInnerTexts().catch(() => [] as string[]);
        const msg =
          `${opts.label} option "${opts.value}" not found in panel. ` +
          `Available (${seen.length}): ${JSON.stringify(seen.slice(0, 10))}` +
          (seen.length > 10 ? ` (+${seen.length - 10} more)` : '');
        if (opts.required) {
          await trigger.click().catch(() => {});
          throw new Error(msg);
        }
        console.warn(`[campaign] ${msg}`);
      }

      // Close panel
      await trigger.click().catch(() => {});
      await panel.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
      return picked;
    });
  }

  /**
   * Select a Campaign Group using the scoped selectors that map directly to
   * the live DOM:
   *   #orglist button.dropdownBtnSec   – opener
   *   #_inorgDropdown                  – panel
   *   #orgsrchInput                    – search input
   *   label.chkLbl                     – option rows (inside the panel)
   *
   * Returns true if the option was found and clicked, false otherwise.
   * Throws if `required` is true and the option could not be selected.
   */
  async selectCampaignGroup(name: string, required = false): Promise<boolean> {
    return await allure.step(`Select Campaign Group: ${name}`, async () => {
      // 1. Open the dropdown
      await this.campaignGroupDropdown.scrollIntoViewIfNeeded();
      await this.campaignGroupDropdown.click();

      // 2. Wait for panel + search input
      await this.campaignGroupPanel.waitFor({ state: 'visible', timeout: 10_000 });
      await this.campaignGroupSearch.waitFor({ state: 'visible', timeout: 5_000 });

      // 3. Type with real keystrokes so Angular's filter pipeline runs
      await this.campaignGroupSearch.click();
      await this.campaignGroupSearch.fill('');
      await this.campaignGroupSearch.pressSequentially(name, { delay: 25 });

      // 4. Click the matching row
      const match = this.campaignGroupOptions.filter({ hasText: new RegExp(name, 'i') }).first();
      const found = await match
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);

      if (!found) {
        const seen = await this.campaignGroupOptions.allInnerTexts().catch(() => [] as string[]);
        const msg =
          `Campaign Group option "${name}" not found. ` +
          `Available (${seen.length}): ${JSON.stringify(seen.slice(0, 10))}` +
          (seen.length > 10 ? ` (+${seen.length - 10} more)` : '');
        await this.page.keyboard.press('Escape').catch(() => {});
        if (required) throw new Error(msg);
        console.warn(`[campaign] ${msg}`);
        return false;
      }

      await match.click();

      // 5. Panel should auto-close on selection; otherwise close it manually
      await this.campaignGroupPanel
        .waitFor({ state: 'hidden', timeout: 5_000 })
        .catch(async () => {
          await this.page.keyboard.press('Escape').catch(() => {});
        });

      // 6. Verify the opener now reflects the chosen value
      await expect(this.campaignGroupDropdown).toContainText(new RegExp(name, 'i'));
      return true;
    });
  }

  async selectApp(name: string, required = false): Promise<boolean> {
    return this.pickFromFilterDropdown({
      triggerIndex: 1,
      value: name,
      label: 'App',
      required,
    });
  }

  /**
   * Set the date range using the same ngx-daterangepicker-material that's on
   * /reports/create. This build has NO `.next` arrow — both calendars
   * navigate independently via their own `.prev`. So range must span the
   * two visible months.
   */
  async setDateRange(
    startMonth: string,
    startYear: string,
    startDay: number,
    endMonth: string,
    endYear: string,
    endDay: number,
  ) {
    await allure.step(
      `Set date range: ${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`,
      async () => {
        await this.dateRangeInput.click();
        await this.page.locator('.md-drppicker.shown').waitFor({ state: 'visible', timeout: 10_000 });
        await this.customRangePreset.click();
        await this.page.waitForTimeout(300);

        const monthMatches = (h: string, m: string, y: string) => h.includes(m) && h.includes(y);

        // 1) Walk LEFT calendar back to startMonth/startYear.
        for (let i = 0; i < 60; i++) {
          const h = ((await this.leftCalendarMonthHeader.textContent()) ?? '').trim();
          if (monthMatches(h, startMonth, startYear)) break;
          await this.leftCalendarPrevArrow.click();
          await this.page.waitForTimeout(150);
        }

        await this.page
          .locator('.calendar.left td.available:not(.off)', {
            hasText: new RegExp(`^\\s*${startDay}\\s*$`),
          })
          .first()
          .click();
        await this.page.waitForTimeout(200);

        // 2) Pick end day — same calendar if same month, otherwise navigate RIGHT back.
        const sameMonth = startMonth === endMonth && startYear === endYear;
        let endCalSelector = '.calendar.left';

        if (!sameMonth) {
          for (let i = 0; i < 60; i++) {
            const rh = ((await this.rightCalendarMonthHeader.textContent()) ?? '').trim();
            if (monthMatches(rh, endMonth, endYear)) break;
            if (!(await this.rightCalendarPrevArrow.isVisible().catch(() => false))) break;
            await this.rightCalendarPrevArrow.click();
            await this.page.waitForTimeout(150);
          }
          endCalSelector = '.calendar.right';
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
      },
    );
  }

  async applyFilters(campaignGroup: string, appSearch: string) {
    await allure.step(`Apply filters: group=${campaignGroup}, app=${appSearch}`, async () => {
      await this.selectCampaignGroup(campaignGroup);
      await this.selectApp(appSearch);
      await this.clickApplyAndWaitForCards();
    });
  }

  /**
   * Click the "Apply" button in the filter bar and wait for the KPI cards
   * to re-render with new totals. Use this when the spec drove the
   * individual filter selections itself (instead of calling `applyFilters`).
   */
  async clickApplyAndWaitForCards() {
    await allure.step('Click Apply and wait for KPI cards', async () => {
      await this.applyFiltersButton.click();
      await this.metricCards.first().waitFor({ state: 'visible', timeout: 30_000 });
      await this.page.waitForTimeout(800);
    });
  }

  /**
   * Read the 8 KPI cards into a metric->raw-string map keyed by canonical
   * CSV metric names (so it composes directly with computeTotals).
   *
   * Card layout (verified):
   *   color1: Impressions             N           -> IMPRESSIONS
   *   color2: Taps                    N           -> TAPS
   *   color3: Downloads               N           -> DL_TOTAL
   *           Downloads (Tap-Through) N (sub)     -> DL_TT
   *   color4: Spends                  $N          -> SPEND
   *           Avg. Daily Spends       $N (sub)    -> AVG_DAILY_COST
   *   color5: CR%                     N%          -> CR_TOTAL
   *           CR% (Tap-Through)       N% (sub)    -> CR_TT
   *   color6: SPD                     $N          -> SPD
   *   color7: Goals                   N           -> GOAL
   *   color8: SPG                     $N          -> SPEND_PER_GOAL
   *
   * Returns { metricName -> raw display string }. Metrics absent from the
   * UI (Cost, CPT, CPM, CPD, Revenue, ROAS, ARPU, ...) are NOT included —
   * the validation spec must skip those.
   */
  async extractTotals(): Promise<Record<string, string>> {
    return await allure.step('Extract UI totals from KPI cards', async () => {
      const out: Record<string, string> = {};

      const cardText = async (sel: string): Promise<string> =>
        ((await this.page.locator(sel).first().innerText().catch(() => '')) ?? '').trim();

      const c1 = await cardText('div.metrics-box.color1');
      const c2 = await cardText('div.metrics-box.color2');
      const c3 = await cardText('div.metrics-box.color3');
      const c4 = await cardText('div.metrics-box.color4');
      const c5 = await cardText('div.metrics-box.color5');
      const c6 = await cardText('div.metrics-box.color6');
      const c7 = await cardText('div.metrics-box.color7');
      const c8 = await cardText('div.metrics-box.color8');

      // Each card is "<Label> <delta>% <primary>  [<sub-label>: <sub-value>]".
      // Take the 1st value-looking token after the first "%", and any
      // "<label>: <value>" pairs after that as sub-metrics.
      const primary = (txt: string) => firstValueAfterPercent(txt);
      const subValue = (txt: string, subLabel: string) => valueAfterLabel(txt, subLabel);

      assignIf(out, 'Impressions', primary(c1));
      assignIf(out, 'Taps', primary(c2));

      // Card 3 — Downloads
      assignIf(out, 'Downloads (Total)', primary(c3));
      assignIf(out, 'Downloads (Tap-Through)', subValue(c3, 'Downloads (Tap-Through)'));

      // Card 4 — Spends + Avg Daily Spends
      assignIf(out, 'Spend', primary(c4));
      assignIf(out, 'Avg Daily Cost', subValue(c4, 'Avg. Daily Spends'));

      // Card 5 — CR%
      assignIf(out, 'CR (Total)', primary(c5));
      assignIf(out, 'CR (Tap-Through)', subValue(c5, 'CR% (Tap-Through)'));

      assignIf(out, 'SPD', primary(c6));
      assignIf(out, 'Goal', primary(c7));
      assignIf(out, 'Spend per Goal', primary(c8));

      return out;
    });
  }

  /**
   * Read the "Totals" row at the bottom of the campaign table and return a
   * { canonicalMetricName -> raw display string } map keyed by the same
   * names used in METRIC_KEYS / computeTotals(). This is the CANONICAL UI
   * source of truth for CSV-vs-UI validation — the KPI cards above use
   * slightly different formulas (e.g. "Avg. Daily Spends" = Spend / days
   * vs the table's "Avg Daily Cost" = Cost / days).
   *
   * The footer is a <mat-footer-row> with one <mat-footer-cell> per visible
   * column. Each cell carries a stable `mat-column-<id>` class — that's what
   * we use to look up cells by name. The displayed value lives in
   * `div.clamp1` for plain cells, or `div.gauge span.value` for the
   * percentage-gauge cells (TTR, CR, CR Total, impShare).
   *
   * NOT included:
   *   - dailyBudgetAmount, ads, NewDownloads/Redownloads alternates,
   *     af_* event columns, supplySources, country, etc. — they have no
   *     counterpart in our 31-metric CSV definition.
   */
  async extractTableTotals(): Promise<Record<string, string>> {
    return await allure.step('Extract UI totals from campaign table footer', async () => {
      // Make sure the footer is rendered. The table is virtualized, so it
      // sometimes only paints once it's scrolled into view.
      await this.tableFooterRow
        .waitFor({ state: 'attached', timeout: 30_000 })
        .catch(() => {});
      await this.tableFooterRow.scrollIntoViewIfNeeded().catch(() => {});
      await this.tableFooterRow.waitFor({ state: 'visible', timeout: 30_000 });

      // Read every footer cell in one round-trip via evaluate(). Doing this
      // client-side is much faster than 30 separate Playwright locator
      // queries, and avoids strict-mode-violation noise from the duplicate
      // chk/Edit/Action sticky cells some Material builds render twice.
      const cellMap: Record<string, string> = await this.tableFooterRow.evaluate(
        (row: Element) => {
          const out: Record<string, string> = {};
          const cells = row.querySelectorAll('mat-footer-cell');
          for (const cell of Array.from(cells)) {
            const colClass = Array.from(cell.classList).find((c) => c.startsWith('mat-column-'));
            if (!colClass) continue;
            const colId = colClass.replace('mat-column-', '');

            const gauge = cell.querySelector('div.gauge span.value');
            const plain = cell.querySelector('div.clamp1');
            const text = (gauge?.textContent ?? plain?.textContent ?? cell.textContent ?? '').trim();
            out[colId] = text;
          }
          return out;
        },
      );

      // Map the raw column ids to canonical CSV metric names. Keep this
      // mapping co-located with the page object — it's UI-side knowledge
      // about how the dashboard names its columns.
      const COLUMN_TO_METRIC: Record<string, string> = {
        Impressions: 'Impressions',
        Taps: 'Taps',
        Downloads: 'Downloads (Tap-Through)',
        vins: 'Downloads (View-Through)',
        tins: 'Downloads (Total)',
        NewDownloads: 'New Downloads (Tap-Through)',
        vnd: 'New Downloads (View-Through)',
        tnd: 'New Downloads (Total)',
        ReDownloads: 'Redownloads (Tap-Through)',
        vrd: 'Redownloads (View-Through)',
        trd: 'Redownloads (Total)',
        Cost: 'Cost',
        Spends: 'Spend',
        CPT: 'CPT',
        CPM: 'CPM',
        CPD: 'CPD (Tap-Through)',
        cpdtotal: 'CPD (Total)',
        avgc: 'Avg Daily Cost',
        spd: 'SPD',
        TTR: 'TTR',
        CR: 'CR (Tap-Through)',
        tinsr: 'CR (Total)',
        Installs: 'Install',
        'Install-Rate': 'Install%',
        g: 'Goal',
        gp: 'Goal%',
        cpg: 'Cost per Goal',
        spg: 'Spend per Goal',
        Revenues: 'Revenue',
        ROASs: 'ROAS',
        ARPUs: 'ARPU',
      };

      const out: Record<string, string> = {};
      for (const [colId, value] of Object.entries(cellMap)) {
        const metric = COLUMN_TO_METRIC[colId];
        if (metric && value) out[metric] = value;
      }

      return out;
    });
  }
}

// ---------- helpers ----------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assignIf(target: Record<string, string>, key: string, value: string | undefined) {
  if (value && value.trim()) target[key] = value.trim();
}

/**
 * Cards print "<Label> <delta>% <primary>". After the FIRST '%' (the delta),
 * the next non-empty token is the primary value (which may itself end in %
 * or start with $).
 */
function firstValueAfterPercent(text: string): string | undefined {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const idx = cleaned.indexOf('%');
  if (idx < 0) return undefined;
  const tail = cleaned.slice(idx + 1).trim();
  const match = tail.match(/^[\$\-\d.,]+%?/);
  return match?.[0];
}

/**
 * Pulls the value after "<subLabel>:" inside the card text.
 * Tolerant of extra whitespace and trailing words.
 */
function valueAfterLabel(text: string, subLabel: string): string | undefined {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const re = new RegExp(`${escapeRegex(subLabel)}\\s*:\\s*([\\$\\-\\d.,]+%?)`, 'i');
  const m = cleaned.match(re);
  return m?.[1];
}
