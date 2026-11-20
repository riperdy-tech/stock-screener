// Pure helpers for the market-state readings on the Macro page and the stock page (WO_MS1). Display only: nothing here
// feeds a score. Every field of every file is optional; a missing one reads as "—" (0 is a value and is shown).
// Run the tests: node node_modules/sucrase/bin/sucrase-node lib/desk/marketState.test.ts   (node:test)

import type { MriDailyRead, MriDriverExposures, MriEconomyState, MriMarketState, MriMonthValue, MriSeriesFact, StockDriverFlags } from '../data-service';

export const DASH = '—';
const MINUS = '−';

type Num = number | null | undefined;

/** A number with a fixed number of decimals and a plain "-" turned into a true minus; "—" when absent. */
export function num(v: Num, digits = 1): string {
    if (typeof v !== 'number' || !Number.isFinite(v)) return DASH;
    return v.toFixed(digits).replace('-', MINUS);
}

/** As `num` with an explicit "+" on a positive value. A value that rounds to zero carries no sign. */
export function sgn(v: Num, digits = 1): string {
    const s = num(v, digits);
    if (s === DASH) return s;
    const n = Number(s.replace(MINUS, '-'));
    return n === 0 ? s.replace(MINUS, '') : n > 0 ? `+${s}` : s;
}

/** The unit suffix a change carries: basis points "bp", a percent change "%", anything else (points) nothing. */
export function unitSuffix(unit: string | null | undefined): string {
    const u = (unit ?? '').toLowerCase();
    if (u.includes('basis')) return ' bp';
    if (u.includes('%') || u.includes('percent')) return '%';
    return '';
}

/** A change with its sign and unit: "+20 bp", "−14.9%", "+7.9". */
export function changeText(v: Num, unit: string | null | undefined): string {
    const digits = unitSuffix(unit) === ' bp' ? 0 : 1;
    const s = sgn(v, digits);
    return s === DASH ? s : `${s}${unitSuffix(unit)}`;
}

/** Whole days from an ISO date (YYYY-MM-DD, or a longer stamp) to `now`; null when the date does not read. */
export function daysOld(date: string | null | undefined, now: number): number | null {
    if (!date) return null;
    const t = Date.parse(date.slice(0, 10));
    return Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000);
}

export const MARKET_STALE_DAYS = 5;
/** The market state is stale when its date is more than five days old. */
export function marketStale(asof: string | null | undefined, now: number): boolean {
    const d = daysOld(asof, now);
    return d !== null && d > MARKET_STALE_DAYS;
}

// ── Header ──────────────────────────────────────────────────────────────────────────────────────

const STEP_KEYS = { calm: 'mcTStepCalm', watch: 'mcTStepWatch', stress: 'mcTStepStress', crisis: 'mcTStepCrisis' } as const;
export type StepKey = (typeof STEP_KEYS)[keyof typeof STEP_KEYS];

/** The i18n key of a stress step, or null for a step this page does not know. */
export function stepKey(step: string | null | undefined): StepKey | null {
    return step && Object.prototype.hasOwnProperty.call(STEP_KEYS, step) ? STEP_KEYS[step as keyof typeof STEP_KEYS] : null;
}

/** Stress and crisis read in the warn colour. */
export const isWarnStep = (step: string | null | undefined) => step === 'stress' || step === 'crisis';

const spaced = (s: string) => s.replace(/_/g, ' ');

const DRIVER_KEYS = {
    rates: 'mcTDrvRates', growth_credit: 'mcTDrvGrowth', inflation: 'mcTDrvInflation',
    none: 'mcTDrvNone', unclear: 'mcTDrvUnclear', mixed: 'mcTDrvMixed',
} as const;

export type DriverPhrase =
    | { key: (typeof DRIVER_KEYS)[keyof typeof DRIVER_KEYS]; vars: Record<string, never> }
    | { key: 'mcTDrvSector'; vars: { s: string } }
    | { key: null; vars: { raw: string } };

/**
 * A driver in words. The market state writes `sector_led:information_technology`, the news read `sector:information_technology`;
 * both read "led by information technology". A value this page does not know comes back as `raw`, underscores as spaces.
 */
export function driverPhrase(driver: string | null | undefined): DriverPhrase | null {
    if (!driver) return null;
    if (Object.prototype.hasOwnProperty.call(DRIVER_KEYS, driver)) return { key: DRIVER_KEYS[driver as keyof typeof DRIVER_KEYS], vars: {} } as DriverPhrase;
    const m = /^sector(?:_led)?:(.+)$/.exec(driver);
    if (m) return m[1] === 'none' ? { key: 'mcTDrvNone', vars: {} } : { key: 'mcTDrvSector', vars: { s: spaced(m[1]) } };
    return { key: null, vars: { raw: spaced(driver) } };
}

// ── Today: market ───────────────────────────────────────────────────────────────────────────────

export interface FactMetric { key: string; label: string; value: string; valueKey?: string; sub?: { key: string; v: string } }

const seriesMetric = (key: string, label: string, f: MriSeriesFact | null | undefined, digits: number, suffix = ''): FactMetric => ({
    key, label,
    value: f?.level == null ? DASH : `${num(f.level, digits)}${suffix}`,
    sub: { key: 'mcTChg21', v: changeText(f?.change_21, f?.change_unit) },
});

/** The small metrics of the Market block, in display order. `label` is an i18n key. A missing fact reads "—". */
export function marketMetrics(ms: MriMarketState | null | undefined): FactMetric[] {
    const f = ms?.facts;
    const spy = f?.spy;
    const pct = (v: Num) => (v == null ? DASH : `${sgn(v, 1)}%`);
    const above = spy?.below_200d;
    return [
        { key: 'r5', label: 'mcTIdx5', value: pct(spy?.return_5) },
        { key: 'r21', label: 'mcTIdx21', value: pct(spy?.return_21) },
        { key: 'r63', label: 'mcTIdx63', value: pct(spy?.return_63) },
        { key: 'dd', label: 'mcTFromHigh', value: pct(spy?.drawdown_pct) },
        { key: 'm200', label: 'mcT200', value: DASH, valueKey: above == null ? undefined : above ? 'mcTBelow' : 'mcTAbove' },
        seriesMetric('vix', 'mcTVix', f?.vix, 1),
        seriesMetric('y2', 'mcTY2', f?.series?.DGS2, 2, '%'),
        seriesMetric('y10', 'mcTY10', f?.series?.DGS10, 2, '%'),
        seriesMetric('hy', 'mcTHy', f?.series?.BAMLH0A0HYM2, 2, '%'),
        seriesMetric('oil', 'mcTOil', f?.series?.DCOILWTICO, 2),
        { key: 'br', label: 'mcTBreadth', value: f?.breadth_below_200d_pct == null ? DASH : `${num(f.breadth_below_200d_pct, 0)}%` },
    ];
}

export interface SectorMove { id: string; name: string; rel: number }

const titled = (id: string) => spaced(id).replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The sectors by their 21-session move against the index: the top three and the bottom three (fewer when fewer exist; never the same one twice). */
export function sectorLeadersLaggards(ms: MriMarketState | null | undefined): { leaders: SectorMove[]; laggards: SectorMove[] } {
    const all: SectorMove[] = [];
    for (const [fund, s] of Object.entries(ms?.facts?.sectors ?? {})) {
        if (s && typeof s.relative_21 === 'number' && Number.isFinite(s.relative_21)) {
            all.push({ id: fund, name: s.sector_id ? titled(s.sector_id) : fund, rel: s.relative_21 });
        }
    }
    all.sort((a, b) => b.rel - a.rel);
    const leaders = all.slice(0, 3);
    const laggards = all.slice(Math.max(3, all.length - 3)).reverse();
    return { leaders, laggards };
}

// ── Today: news read ────────────────────────────────────────────────────────────────────────────

export type ReadState = 'none' | 'kept' | 'fresh';

/** `none` for a missing file or status none (or no read in it), `kept` for status kept_previous, else `fresh`. */
export function readState(dr: MriDailyRead | null | undefined): ReadState {
    if (!dr || dr.status === 'none') return 'none';
    if (dr.status === 'kept_previous') return 'kept';
    return dr.read ? 'fresh' : 'none';
}

/** One word for whether the news driver and the price driver agree: true "agree", false "differ", null "—". */
export function agreeKey(agree: boolean | null | undefined): 'mcTAgree' | 'mcTDiffer' | null {
    return agree === true ? 'mcTAgree' : agree === false ? 'mcTDiffer' : null;
}

export function exposedKey(direction: string | null | undefined): 'mcTHurt' | 'mcTHelped' | null {
    return direction === 'hurt' ? 'mcTHurt' : direction === 'helped' ? 'mcTHelped' : null;
}

// ── Today: economy ──────────────────────────────────────────────────────────────────────────────

const WORD_KEYS: Record<string, string> = {
    'below target': 'mcTwBelowTarget', 'near target': 'mcTwNearTarget', 'above target': 'mcTwAboveTarget', 'well above target': 'mcTwWellAbove',
    rising: 'mcTwRising', falling: 'mcTwFalling', steady: 'mcTwSteady', tightening: 'mcTwTightening', easing: 'mcTwEasing', 'on hold': 'mcTwOnHold',
    deteriorating: 'mcTwDeteriorating', softening: 'mcTwSoftening', contracting: 'mcTwContracting', expanding: 'mcTwExpanding',
    accelerating: 'mcTwAccelerating', slowing: 'mcTwSlowing',
};

/** The i18n key of an economy word the engine writes; null for one this page does not know (show it as written). */
export function econWordKey(word: string | null | undefined): string | null {
    return word && Object.prototype.hasOwnProperty.call(WORD_KEYS, word) ? WORD_KEYS[word] : null;
}

const mv = (m: MriMonthValue | undefined): number | null => (typeof m?.value === 'number' ? m.value : null);

export interface EconRow { key: 'inflation' | 'policy' | 'jobs' | 'growth'; label: string; words: (string | null)[]; numKey: string; numVars: Record<string, string> }

/** The four economy rows: label key, the words (as the file writes them; null is "—") and the one supporting number. */
export function economyRows(e: MriEconomyState | null | undefined): EconRow[] {
    const p = (v: number | null, d = 1) => (v === null ? DASH : `${num(v, d)}%`);
    return [
        { key: 'inflation', label: 'mcTInfl', words: [e?.inflation?.level ?? null, e?.inflation?.direction ?? null],
            numKey: 'mcTInflNum', numVars: { v: p(mv(e?.inflation?.series?.PCEPI?.rate_12)) } },
        { key: 'policy', label: 'mcTPolicy', words: [e?.policy?.direction ?? null],
            numKey: 'mcTPolNum', numVars: { r: p(mv(e?.policy?.funds_rate), 2), c: sgn(mv(e?.policy?.change_6m), 2) } },
        { key: 'jobs', label: 'mcTJobs', words: [e?.jobs?.state ?? null],
            numKey: 'mcTJobNum', numVars: { u: p(mv(e?.jobs?.unemployment)), r: sgn(mv(e?.jobs?.rise_from_low), 1) } },
        { key: 'growth', label: 'mcTGrowth', words: [e?.growth?.state ?? null, e?.growth?.direction ?? null],
            numKey: 'mcTGrowNum', numVars: { v: p(mv(e?.growth?.payrolls_rate_12)) } },
    ];
}

// ── Today: what the moves explain ───────────────────────────────────────────────────────────────

export interface DriverMoveRow { id: string; unit: string; change: string; moved: boolean | null }

/** Each driver's 21-session change with its unit, and whether it moved. */
export function driverMoveRows(x: MriDriverExposures | null | undefined): DriverMoveRow[] {
    return Object.entries(x?.drivers ?? {}).map(([id, d]) => {
        const w = d?.windows?.['21'];
        return { id, unit: d?.unit ?? '', change: changeText(w?.change, d?.unit), moved: w?.moved ?? null };
    });
}

export interface FundRow { id: string; name: string; realised: number | null; implied: number | null; unexplained: number | null }

/** The sector funds for the 21-session window, sorted by realised (largest first; a fund with no realised value goes last). */
export function fundRows(x: MriDriverExposures | null | undefined): FundRow[] {
    const n = (v: Num) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const rows = Object.entries(x?.funds ?? {}).map(([id, f]) => {
        const r = f?.readings?.['21'];
        return { id, name: f?.sector_id ? titled(f.sector_id) : id, realised: n(r?.realised), implied: n(r?.implied_total), unexplained: n(r?.unexplained) };
    });
    return rows.sort((a, b) => (a.realised === null ? 1 : 0) - (b.realised === null ? 1 : 0) || (b.realised ?? 0) - (a.realised ?? 0));
}

// ── Stock page ──────────────────────────────────────────────────────────────────────────────────

/** What the stock panel shows: the flags' own sentences, or null when the stock has no entry or no fit (the panel is then not rendered). */
export function driverFlagsFor(p: StockDriverFlags | null | undefined, ticker: string): string[] | null {
    const e = p?.tickers?.[ticker.toUpperCase()];
    if (!e || e.exposures == null) return null;
    return (e.flags ?? []).map((f) => f?.text).filter((t): t is string => typeof t === 'string' && t.length > 0);
}
