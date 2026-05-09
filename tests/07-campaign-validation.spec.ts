import { test, expect } from '../fixtures/base-fixture';
import { allure } from 'allure-playwright';
import { config } from '../config/env';
import { CampaignManagementPage } from '../pages/campaign-management.page';
import { readCsv, readCsvDateRangeDays, readCsvDateRange } from '../utils/csv-reader';
import { computeTotals } from '../utils/matrics-calculators';
import { parseUiNumber, withinTolerance } from '../utils/tolerance';
import { ALL_METRICS, REPORT_TYPES, ReportType, reportFileKeyword } from '../data/metric-definitions';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Cache file that survives worker restarts.
 *
 * Playwright restarts the worker process after a test failure to keep tests
 * isolated. That wipes module-scope variables, so the next test would see
 * an empty `uiTotals` cache and either skip itself or fail noisily. We
 * persist the setup output to disk and reload it on demand from each test.
 */
const CACHE_DIR = path.resolve('./test-data/.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'uc7-validation-cache.json');

interface ValidationCache {
  csvTotals: Partial<Record<ReportType, Record<string, number>>>;
  uiTotals: Record<string, string>;
  dateRange: string;
}

function writeCache(data: ValidationCache): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function readCache(): ValidationCache | undefined {
  if (!fs.existsSync(CACHE_FILE)) return undefined;
  try {
    // Strip a UTF-8 BOM if some other tool wrote the file (PowerShell's
    // `Set-Content -Encoding UTF8` adds one, and JSON.parse rejects it).
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8').replace(/^\uFEFF/, '');
    return JSON.parse(raw) as ValidationCache;
  } catch (err) {
    console.warn(`[validation] cache file at ${CACHE_FILE} is unreadable:`, err);
    return undefined;
  }
}

/**
 * Use Case 7 — 31 metrics × 4 report types = 124 independent assertions.
 *
 * Design notes:
 *
 * 1. The describe is INTENTIONALLY NOT `serial`. With `.serial`, the first
 *    failing assertion would skip all subsequent tests in the suite — so a
 *    single column-name typo in the CSV could mask the next 100 results.
 *    In normal (non-serial) mode each metric test is independent: one
 *    failure does not affect the others.
 *
 * 2. The setup work (parse 4 CSVs, log in, navigate, set date range, pick
 *    filters, scrape the KPI cards) is expensive and should run once, not
 *    124 times. Playwright runs every test of a single file in the same
 *    worker, so we can populate two module-scope caches in a regular
 *    `setup` test and have every subsequent test read from those caches.
 *
 * 3. If the setup test itself fails (e.g. login broken, CSV missing, dropdown
 *    re-arranged) the caches stay empty. Without guards, all 124 metric
 *    tests would then explode with confusing tolerance errors. Instead each
 *    metric test checks the `setupCompleted` flag first and `test.skip`s
 *    with a clear reason — keeping the report tidy and pointing the
 *    investigator straight at the broken setup.
 */
test.describe('Use Case 7 — Validate CSV vs UI (124 assertions)', () => {
  // The setup does CSV parsing + dashboard hydration + date-range walk +
  // 2 custom dropdowns + Apply, all on a cold cache. Default 120 s isn't enough.
  test.setTimeout(5 * 60_000);

  const csvTotals: Partial<Record<ReportType, Record<string, number>>> = {};
  let uiTotals: Record<string, string> = {};
  let dateRange: string = '';
  let setupCompleted = false;
  let setupError: string | null = null;

  // Using test.beforeAll() so setup doesn't appear as a test in Allure report
  test.beforeAll(async ({ browser }) => {
    try {
      // 1. Load each CSV and compute totals
      for (const key of REPORT_TYPES) {
        const kw = reportFileKeyword(key);
        const csvFile = fs.readdirSync(config.dataDir)
          .find(f => f.toLowerCase().endsWith('.csv') && f.toLowerCase().includes(kw));
        if (!csvFile) throw new Error(`CSV for ${key} not found in ${config.dataDir}`);
        const csvPath = path.join(config.dataDir, csvFile);
        const rows = readCsv(csvPath);
        const calendarDays = readCsvDateRangeDays(csvPath);
        csvTotals[key] = computeTotals(rows, calendarDays).totals;

        // Extract date range from the first CSV
        if (!dateRange) {
          dateRange = readCsvDateRange(csvPath) ?? '';
        }
      }

      // 2. Open Campaign Management, set date range, pick filters, extract UI totals
      // Load storageState (login session) so we're authenticated
      const STORAGE_STATE = path.resolve('./test-data/.auth/state.json');
      const storageExists = fs.existsSync(STORAGE_STATE);
      const context = await browser.newContext({
        acceptDownloads: true,
        storageState: storageExists ? STORAGE_STATE : undefined,
      });
      const page = await context.newPage();

      const cm = new CampaignManagementPage(page);
      await cm.goto(config.applicationUrl, config.campaignManagementPath);
      await cm.setDateRange(
        config.dateRange.startMonth, config.dateRange.startYear, config.dateRange.startDay,
        config.dateRange.endMonth,   config.dateRange.endYear,   config.dateRange.endDay,
      );
      await cm.selectCampaignGroup(config.campaignGroupName, /* required */ true);
      await cm.selectApp(config.campaignAppSearchText, /* required */ false);
      await cm.clickApplyAndWaitForCards();

      // Read the campaign-table TOTALS row
      uiTotals = await cm.extractTableTotals();
      console.log('[validation] UI totals available:', Object.keys(uiTotals));
      if (Object.keys(uiTotals).length === 0) {
        throw new Error('No UI totals extracted from campaign table');
      }

      await page.close();
      await context.close();

      // Persist to disk for worker restart recovery
      writeCache({ csvTotals, uiTotals, dateRange });
      setupCompleted = true;
    } catch (err) {
      setupError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  });

  /**
   * Make sure the in-memory caches are populated for the current test.
   * On the first test in a fresh worker, the module-scope variables are
   * empty even though setup ran successfully in a previous worker —
   * load them from the on-disk cache.
   */
  function ensureCacheLoaded(): boolean {
    if (Object.keys(uiTotals).length > 0) return true;
    const cached = readCache();
    if (!cached) return false;
    Object.assign(csvTotals, cached.csvTotals);
    uiTotals = cached.uiTotals;
    dateRange = cached.dateRange ?? '';
    setupCompleted = true;
    return true;
  }

  for (const reportType of REPORT_TYPES) {
    for (const metric of ALL_METRICS) {
      test(`${reportType} · ${metric}`, async () => {
        // Setup may have run in a previous worker process — Playwright
        // recycles the worker after a test failure, which wipes our
        // module-scope cache. Try the on-disk cache first.
        if (!ensureCacheLoaded()) {
          test.skip(
            true,
            setupError
              ? `Setup failed; see "setup — load CSVs and extract UI totals". Reason: ${setupError}`
              : 'Setup did not run to completion (no cache file found).',
          );
          return;
        }

        // Add metadata to Allure report (parameters show in the "Parameters" panel)
        await allure.parameter('Date Range', dateRange || 'N/A');
        await allure.parameter('Report Type', reportType);
        await allure.parameter('Metric', metric);

        // The campaign table footer covers all 31 CSV metrics. If something
        // is still missing (e.g. the column was hidden via the "Filters"
        // toolbar in this account), skip it with a clear reason rather
        // than fail noisily.
        if (!(metric in uiTotals)) {
          test.skip(true, `Metric "${metric}" column is not visible in the campaign table footer.`);
          return;
        }

        const csvValue = csvTotals[reportType]?.[metric] ?? NaN;
        const uiValue  = parseUiNumber(uiTotals[metric]);

        // Playwright shows the second argument of `expect(...)` as the step
        // label both on success AND failure. Word it as a NEUTRAL description
        // of the comparison ("CSV=…, UI=…, tolerance=…") rather than a
        // failure message ("does not match…") so the report reads correctly
        // when the assertion passes.
        const ok = withinTolerance(csvValue, uiValue, config.tolerance);
        expect(
            ok,
            `${reportType} ${metric}: CSV=${csvValue}, UI=${uiValue} `
              + `(tolerance ±${config.tolerance.relative * 100}% ±${config.tolerance.absolute})`,
          ).toBeTruthy();
      });
    }
  }
});
