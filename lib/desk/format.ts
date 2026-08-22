// Shared number/date formatting for the desk surfaces. All figures render in
// Spline Sans Mono with tabular numerals, so widths must be stable.

export function fmtMcap(v: number | null | undefined): string {
    if (!v) return '—';
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${v.toFixed(0)}`;
}

/** Fraction (0.183) → "18.3%". Pass alreadyPct for values that are already 18.3. */
export function fmtPct(v: number | null | undefined, digits = 1, alreadyPct = false): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    return `${(alreadyPct ? v : v * 100).toFixed(digits)}%`;
}

/** Signed percent, already in percent units: 1.9 → "+1.9%", -12.4 → "−12.4%". */
export function fmtSignedPct(v: number | null | undefined, digits = 1): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    return `${sign}${Math.abs(v).toFixed(digits)}%`;
}

export function fmtMoney(v: number | null | undefined, digits = 2): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Whole-dollar money for chart axes and legends: 11410 → "$11,410". */
export function fmtDollars(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    return `$${Math.round(v).toLocaleString('en-US')}`;
}

/** 2026-08-21 → "AUG 21". Safe on null/garbage. */
export function fmtDateShort(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

/** ISO timestamp → "2026-08-21 06:04 ET"-ish run stamp for the status strip. */
export function fmtRunStamp(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    const date = d.toISOString().slice(0, 10);
    const time = d.toTimeString().slice(0, 5);
    return `${date} ${time}`;
}

export function fmtCount(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    return v.toLocaleString('en-US');
}
