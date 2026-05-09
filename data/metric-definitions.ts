import { METRIC_KEYS } from '../utils/matrics-calculators';

/** The 31-metric list exactly as described in the Java suite. */
export const ALL_METRICS: string[] = [
  METRIC_KEYS.IMPRESSIONS, METRIC_KEYS.TAPS,
  METRIC_KEYS.DL_TT, METRIC_KEYS.DL_VT, METRIC_KEYS.DL_TOTAL,
  METRIC_KEYS.NEWDL_TT, METRIC_KEYS.NEWDL_VT, METRIC_KEYS.NEWDL_TOTAL,
  METRIC_KEYS.REDL_TT, METRIC_KEYS.REDL_VT, METRIC_KEYS.REDL_TOTAL,
  METRIC_KEYS.COST, METRIC_KEYS.SPEND,
  METRIC_KEYS.CPT, METRIC_KEYS.CPM,
  METRIC_KEYS.CPD_TT, METRIC_KEYS.CPD_TOTAL,
  METRIC_KEYS.AVG_DAILY_COST, METRIC_KEYS.SPD,
  METRIC_KEYS.TTR, METRIC_KEYS.CR_TT, METRIC_KEYS.CR_TOTAL,
  METRIC_KEYS.INSTALL, METRIC_KEYS.INSTALL_PCT,
  METRIC_KEYS.GOAL, METRIC_KEYS.GOAL_PCT,
  METRIC_KEYS.COST_PER_GOAL, METRIC_KEYS.SPEND_PER_GOAL,
  METRIC_KEYS.REVENUE, METRIC_KEYS.ROAS, METRIC_KEYS.ARPU,
];

export const REPORT_TYPES = ['Daily', 'Weekly', 'Monthly', 'NoTimeDimension'] as const;
export type ReportType = typeof REPORT_TYPES[number];

/**
 * Single source of truth for the report name suffix used in /reports.
 * The create spec saves reports as `${baseName} - ${key}` literally, so the
 * download spec must use the same format (no spacing, no transformation).
 *
 *   Daily / Weekly / Monthly / NoTimeDimension  -> all used verbatim
 */
export function reportDisplayName(baseName: string, type: ReportType): string {
  return `${baseName} - ${type}`;
}

/**
 * Lowercase keyword used to locate the corresponding ZIP/CSV on disk.
 * The server-generated filename always embeds the report name, so we match
 * on the type token directly (avoids the old `'no'` substring which is too
 * loose and could collide with other filenames).
 *
 *   Daily            -> "daily"
 *   Weekly           -> "weekly"
 *   Monthly          -> "monthly"
 *   NoTimeDimension  -> "notimedimension"
 */
export function reportFileKeyword(type: ReportType): string {
  return type.toLowerCase();
}