export interface ToleranceOpts {
    relative: number;   // e.g. 0.02  (2%)
    absolute: number;   // e.g. 0.015 (flat)
  }
  
  export function withinTolerance(csvValue: number, uiValue: number, t: ToleranceOpts): boolean {
    const lo = uiValue * (1 - t.relative) - t.absolute;
    const hi = uiValue * (1 + t.relative) + t.absolute;
    return csvValue >= lo && csvValue <= hi;
  }
  
  export function parseUiNumber(raw: string | undefined | null): number {
    if (raw == null) return 0;
    const cleaned = String(raw).replace(/,/g, '').replace(/%/g, '').replace(/[^\d.\-eE]/g, '').trim();
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }