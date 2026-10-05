// Text and geometry for one Desk row, as pure functions. `null` renders as "—"; `0` is a value.

import type { DeskRow } from './rankings';
import type { DeskVerdict } from './verdict';
import { scaleBand } from './band';

const MINUS = '−';

/** The price shown in the row: the live stocks.csv quote only (0 means "not stored"). */
export function livePrice(r: DeskRow): number | null {
    const p = r.info?.price;
    return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
}

/** `top {100 − fct_percentile} %`; one decimal under 10 so a 99.8 does not read "top 0 %". Null when there is no percentile. */
export function topPct(percentile: number | null | undefined): string | null {
    if (percentile == null || !Number.isFinite(percentile)) return null;
    const top = Math.max(0, 100 - percentile);
    if (top < 0.05) return 'top <0.1 %'; // a percentile of 100 is the best in the universe, never "top 0.0 %"
    return `top ${top < 10 ? top.toFixed(1) : Math.round(top)} %`;
}

/** Signed percent with a true minus; "—" when null. */
export function signedPct(v: number | null | undefined, digits = 0): string {
    if (v == null || !Number.isFinite(v)) return '—';
    const sign = v > 0 ? '+' : v < 0 ? MINUS : '';
    return `${sign}${Math.abs(v).toFixed(digits)} %`;
}

/** Whole dollars when >= $10, else cents. */
const bandDollar = (v: number) => (Math.abs(v) >= 10 ? Math.round(v).toString() : v.toFixed(2));

export type BandReading = 'inside' | 'below' | 'above' | 'unknown';

export interface BandView {
    /** Text label under the strip: `$52–58 · MED 55` or `$37.55 · one run`. */
    label: string;
    /** `$52–58` / `$37.55`, for the screen-reader sentence. */
    range: string;
    median: number | null;
    single: boolean;
    reading: BandReading;
}

export function bandView(d: DeskVerdict, price: number | null): BandView | null {
    const { iv_band_low: lo, iv_band_high: hi, median_iv: med } = d;
    if (lo == null || hi == null) return null;
    const single = d.n_basis === 1 || lo === hi;
    const range = single ? `$${(med ?? lo).toFixed(2)}` : `$${bandDollar(lo)}–${bandDollar(hi)}`;
    const label = single
        ? `${range} · one run`
        : `${range}${med != null ? ` · MED ${bandDollar(med)}` : ''}`;
    const reading: BandReading = price == null ? 'unknown' : price < lo ? 'below' : price > hi ? 'above' : 'inside';
    return { label, range, median: med, single, reading };
}

/** Geometry for the strip (percent offsets), reusing the shared scaler. Null when there is no band. */
export function bandGeometry(d: DeskVerdict, price: number | null) {
    if (d.iv_band_low == null || d.iv_band_high == null) return null;
    const g = scaleBand({ price, low: d.iv_band_low, high: d.iv_band_high, median: d.median_iv });
    return g.ok ? g : null;
}

export type TimingKind = 'buy_now' | 'wait_trend' | 'paused' | 'avoid' | 'single_run' | 'none' | 'other';

/**
 * Timing cell: the live timing wins over the verdict-time one. `paused` only on an actionable row
 * that has follow-up data and `buy_paused !== false` (unknown counts as paused). A blocked row
 * whose reasons include `single_sample` reads `single run` instead of a timing call.
 */
export function timingOf(v: DeskVerdict): { kind: TimingKind; reason: string | null; raw: string | null } {
    const raw = v.entry_timing_now ?? v.entry_timing ?? null;
    const followup = v.buy_paused != null || v.followup_asof != null;
    if (v.actionable === true && followup && v.buy_paused !== false) {
        return { kind: 'paused', reason: v.buy_paused_reasons?.[0] ?? null, raw };
    }
    if (v.actionable !== true && (v.actionable_reasons ?? []).includes('single_sample')) {
        return { kind: 'single_run', reason: null, raw };
    }
    if (raw == null) return { kind: 'none', reason: null, raw };
    if (raw === 'buy_now') return { kind: 'buy_now', reason: null, raw };
    if (raw === 'wait_for_momentum') return { kind: 'wait_trend', reason: null, raw };
    if (raw === 'avoid') return { kind: 'avoid', reason: null, raw };
    return { kind: 'other', reason: null, raw };
}

/** Q M R V G in the order shown, with the `fct_z` key behind each. */
export const PILLARS: { letter: string; key: string; family: 'quality' | 'momentum' | 'revisions' | 'value' | 'exp_gap'; word: string }[] = [
    { letter: 'Q', key: 'quality', family: 'quality', word: 'quality' },
    { letter: 'M', key: 'momentum', family: 'momentum', word: 'momentum' },
    { letter: 'R', key: 'revisions', family: 'revisions', word: 'revisions' },
    { letter: 'V', key: 'value', family: 'value', word: 'value' },
    { letter: 'G', key: 'exp_gap', family: 'exp_gap', word: 'expectations gap' },
];

/** Bar height as a share of the whole track: min(50 %, |z| x 22 %), from the centre. Null for a missing pillar. */
export function pillarBar(z: number | null | undefined): { up: boolean; heightPct: number } | null {
    if (z == null || !Number.isFinite(z)) return null;
    return { up: z >= 0, heightPct: Math.min(50, Math.abs(z) * 22) };
}

/** Signed number with a true minus; em dash when null. */
export function signedNum(v: number | null | undefined, digits = 1): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(digits)}`;
}

/** Verdict age in whole days from the row's `date`; null when unreadable. */
export function verdictAgeDays(v: DeskVerdict, now: number): number | null {
    if (!v.date) return null;
    const ms = Date.parse(`${v.date.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(ms) ? null : Math.max(0, Math.floor((now - ms) / 86_400_000));
}

/** The crux for the expand panel, from `crux[0]` only. Values are as stored (fractions for rates). */
export function cruxParts(v: DeskVerdict): { input: string; implied: number | null; own: number | null } | null {
    const c = v.crux?.[0];
    return c && c.input ? { input: c.input, implied: c.implied ?? null, own: c.own ?? null } : null;
}
