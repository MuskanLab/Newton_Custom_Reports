import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

export type CsvRow = Record<string, string>;

/**
 * Read a custom report CSV.
 *
 * The exported reports are NOT a plain header+rows CSV. Each file starts
 * with ~7 metadata rows (Report Name, Apps, Preset, Date Range, ...) that
 * have only 2 columns, followed by a few blank lines, then the real
 * 30+ column table header.  The naive `parse(raw, { columns: true })`
 * approach throws "Invalid Record Length" because it treats line 1 as
 * the header.
 *
 * Strategy: locate the real header line (first non-empty line with many
 * commas) and parse from there. `relax_column_count` is left on for
 * resilience against trailing summary rows.
 */
export function readCsv(filePath: string): CsvRow[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/);

  // The real table header has way more columns than the metadata rows.
  // Anything with > 5 commas is treated as the table header.
  const headerIdx = lines.findIndex((l) => (l.match(/,/g)?.length ?? 0) > 5);
  const tableText = headerIdx >= 0 ? lines.slice(headerIdx).join('\n') : raw;

  return parse(tableText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as CsvRow[];
}

/**
 * Extract the date range string from the CSV preamble.
 * Returns something like "2026-02-01 - 2026-03-03" or undefined if not found.
 */
export function readCsvDateRange(filePath: string): string | undefined {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).slice(0, 10);
  const dateRangeLine = lines.find((l) => /^date\s*range\s*,/i.test(l));
  if (!dateRangeLine) return undefined;

  const m = dateRangeLine.match(/(\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2})/);
  return m ? m[1].trim() : undefined;
}

/**
 * Parse the calendar date range from the CSV preamble (line 4 in our exports
 * looks like `Date Range,2026-02-01 - 2026-03-03`). Returns the inclusive
 * day count, or `undefined` if the header is missing or malformed.
 *
 * Why this exists: time-period reports (Weekly, Monthly, NoTimeDimension)
 * have FEWER data rows than calendar days (a 31-day range collapses to ~6
 * weekly rows or 1 NoTimeDimension row). Counting distinct date strings in
 * the table gives 6 instead of 31, which breaks any "per-day" metric like
 * `Avg Daily Cost = Cost / days`. The UI always divides by true calendar
 * days, so we must too — and the metadata is the only place that survives
 * the grouping.
 */
export function readCsvDateRangeDays(filePath: string): number | undefined {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).slice(0, 10); // metadata is in the first ~7 lines
  const dateRangeLine = lines.find((l) => /^date\s*range\s*,/i.test(l));
  if (!dateRangeLine) return undefined;

  // "Date Range,2026-02-01 - 2026-03-03"  →  ["2026-02-01", "2026-03-03"]
  const m = dateRangeLine.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return undefined;

  const start = new Date(m[1] + 'T00:00:00Z').getTime();
  const end = new Date(m[2] + 'T00:00:00Z').getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;

  // Inclusive day count: Feb 1..Mar 3 == 31 days, not 30.
  return Math.round((end - start) / 86_400_000) + 1;
}

export function toNumber(value: string | undefined | null): number {
  if (value == null) return 0;
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.\-eE]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize a column header for tolerant matching.
 * The exported reports use inconsistent whitespace (e.g. `Downloads ( Tap-Through)`,
 * `Downloads ( Total )`, `CR ( Tap-Through)`), inconsistent casing
 * (`Cost per goal` vs `Cost per Goal`) and spelling variants
 * (`Redownloads` vs `Re-Downloads`). Compare with everything stripped to
 * letters+digits so all variants collapse to the same key.
 */
function normalizeHeader(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Find the actual key in a row whose normalized name matches `column`.
 * Returns the original key string so the caller can index into the row.
 */
export function findColumn(row: CsvRow | undefined, column: string): string | undefined {
  if (!row) return undefined;
  if (column in row) return column;
  const target = normalizeHeader(column);
  for (const key of Object.keys(row)) {
    if (normalizeHeader(key) === target) return key;
  }
  return undefined;
}

export function sumColumn(rows: CsvRow[], column: string): number {
  if (rows.length === 0) return 0;
  const actualKey = findColumn(rows[0], column);
  if (!actualKey) return 0;
  return rows.reduce((acc, r) => acc + toNumber(r[actualKey]), 0);
}