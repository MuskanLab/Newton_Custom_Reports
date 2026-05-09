import { CsvRow, sumColumn, toNumber } from './csv-reader';

/**
 * Canonical metric keys used across CSV vs UI comparisons.
 * If your CSV headers differ, adjust the `CSV_COLUMN_MAP` below.
 */
export const METRIC_KEYS = {
  // Sum columns
  IMPRESSIONS: 'Impressions',
  TAPS: 'Taps',
  DL_TT: 'Downloads (Tap-Through)',
  DL_VT: 'Downloads (View-Through)',
  COST: 'Cost',
  SPEND: 'Spend',
  NEWDL_TT: 'New Downloads (Tap-Through)',
  NEWDL_VT: 'New Downloads (View-Through)',
  REDL_TT: 'Redownloads (Tap-Through)',
  REDL_VT: 'Redownloads (View-Through)',
  INSTALL: 'Install',
  GOAL: 'Goal',
  REVENUE: 'Revenue',

  // Derived sums
  DL_TOTAL: 'Downloads (Total)',
  NEWDL_TOTAL: 'New Downloads (Total)',
  REDL_TOTAL: 'Redownloads (Total)',

  // Calculated
  TTR: 'TTR',
  CR_TT: 'CR (Tap-Through)',
  CR_TOTAL: 'CR (Total)',
  CPT: 'CPT',
  CPM: 'CPM',
  CPD_TT: 'CPD (Tap-Through)',
  CPD_TOTAL: 'CPD (Total)',
  AVG_DAILY_COST: 'Avg Daily Cost',
  SPD: 'SPD',
  INSTALL_PCT: 'Install%',
  GOAL_PCT: 'Goal%',
  COST_PER_GOAL: 'Cost per Goal',
  SPEND_PER_GOAL: 'Spend per Goal',
  ROAS: 'ROAS',
  ARPU: 'ARPU',
} as const;

/**
 * Map canonical metric keys → CSV column header names.
 * TODO: verify these against an actual downloaded CSV header row.
 */
const CSV_COLUMN_MAP: Record<string, string> = {
  [METRIC_KEYS.IMPRESSIONS]: 'Impressions',
  [METRIC_KEYS.TAPS]: 'Taps',
  [METRIC_KEYS.DL_TT]: 'Downloads (Tap-Through)',
  [METRIC_KEYS.DL_VT]: 'Downloads (View-Through)',
  [METRIC_KEYS.COST]: 'Cost',
  [METRIC_KEYS.SPEND]: 'Spend',
  [METRIC_KEYS.NEWDL_TT]: 'New Downloads (Tap-Through)',
  [METRIC_KEYS.NEWDL_VT]: 'New Downloads (View-Through)',
  [METRIC_KEYS.REDL_TT]: 'Redownloads (Tap-Through)',
  [METRIC_KEYS.REDL_VT]: 'Redownloads (View-Through)',
  [METRIC_KEYS.INSTALL]: 'Install',
  [METRIC_KEYS.GOAL]: 'Goal',
  [METRIC_KEYS.REVENUE]: 'Revenue',
};

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export interface ComputedTotals {
  totals: Record<string, number>;
  calendarDays: number;
}

/**
 * Compute totals and all calculated metrics from a parsed CSV.
 * `calendarDays` defaults to the distinct date count in the CSV if present,
 * otherwise the number of data rows.
 */
export function computeTotals(rows: CsvRow[], calendarDaysOverride?: number): ComputedTotals {
  const t: Record<string, number> = {};

  // 1. Direct sums
  for (const key of [
    METRIC_KEYS.IMPRESSIONS, METRIC_KEYS.TAPS,
    METRIC_KEYS.DL_TT, METRIC_KEYS.DL_VT,
    METRIC_KEYS.COST, METRIC_KEYS.SPEND,
    METRIC_KEYS.NEWDL_TT, METRIC_KEYS.NEWDL_VT,
    METRIC_KEYS.REDL_TT, METRIC_KEYS.REDL_VT,
    METRIC_KEYS.INSTALL, METRIC_KEYS.GOAL, METRIC_KEYS.REVENUE,
  ]) {
    t[key] = sumColumn(rows, CSV_COLUMN_MAP[key] ?? key);
  }

  // 2. Derived sums
  t[METRIC_KEYS.DL_TOTAL]    = t[METRIC_KEYS.DL_TT]    + t[METRIC_KEYS.DL_VT];
  t[METRIC_KEYS.NEWDL_TOTAL] = t[METRIC_KEYS.NEWDL_TT] + t[METRIC_KEYS.NEWDL_VT];
  t[METRIC_KEYS.REDL_TOTAL]  = t[METRIC_KEYS.REDL_TT]  + t[METRIC_KEYS.REDL_VT];

  // 3. Calendar days
  const dateCol = ['Date', 'Date/Time', 'Day'].find(c => rows[0] && c in rows[0]);
  const calendarDays = calendarDaysOverride ??
    (dateCol ? new Set(rows.map(r => r[dateCol])).size : rows.length || 1);

  // 4. Calculated metrics
  t[METRIC_KEYS.TTR]            = safeDiv(t[METRIC_KEYS.TAPS], t[METRIC_KEYS.IMPRESSIONS]) * 100;
  t[METRIC_KEYS.CR_TT]          = safeDiv(t[METRIC_KEYS.DL_TT], t[METRIC_KEYS.TAPS]) * 100;
  t[METRIC_KEYS.CR_TOTAL]       = safeDiv(t[METRIC_KEYS.DL_TOTAL], t[METRIC_KEYS.TAPS]) * 100;
  t[METRIC_KEYS.CPT]            = safeDiv(t[METRIC_KEYS.COST], t[METRIC_KEYS.TAPS]);
  t[METRIC_KEYS.CPM]            = safeDiv(t[METRIC_KEYS.COST], t[METRIC_KEYS.IMPRESSIONS]) * 1000;
  t[METRIC_KEYS.CPD_TT]         = safeDiv(t[METRIC_KEYS.COST], t[METRIC_KEYS.DL_TT]);
  t[METRIC_KEYS.CPD_TOTAL]      = safeDiv(t[METRIC_KEYS.COST], t[METRIC_KEYS.DL_TOTAL]);
  // The campaign TABLE totals row shows "Avg. Daily Cost = Cost / calendar days"
  // (verified: CSV 248.06 ≈ table 248.04 for the same filter). The KPI card
  // at the top is labelled "Avg. Daily Spends" and uses Spend instead — that
  // is a different metric and is intentionally NOT compared against this one.
  t[METRIC_KEYS.AVG_DAILY_COST] = safeDiv(t[METRIC_KEYS.COST], calendarDays);
  t[METRIC_KEYS.SPD]            = safeDiv(t[METRIC_KEYS.SPEND], t[METRIC_KEYS.DL_TT]);
  t[METRIC_KEYS.INSTALL_PCT]    = safeDiv(t[METRIC_KEYS.INSTALL], t[METRIC_KEYS.DL_TT]) * 100;
  t[METRIC_KEYS.GOAL_PCT]       = safeDiv(t[METRIC_KEYS.GOAL], t[METRIC_KEYS.INSTALL]) * 100;
  t[METRIC_KEYS.COST_PER_GOAL]  = safeDiv(t[METRIC_KEYS.COST], t[METRIC_KEYS.GOAL]);
  t[METRIC_KEYS.SPEND_PER_GOAL] = safeDiv(t[METRIC_KEYS.SPEND], t[METRIC_KEYS.GOAL]);
  t[METRIC_KEYS.ROAS]           = safeDiv(t[METRIC_KEYS.REVENUE], t[METRIC_KEYS.COST]);
  t[METRIC_KEYS.ARPU]           = safeDiv(t[METRIC_KEYS.REVENUE], t[METRIC_KEYS.INSTALL]);

  return { totals: t, calendarDays };
}