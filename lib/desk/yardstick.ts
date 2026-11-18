// The yardstick beside the AI verdict: our value (from the source that gave the verdict), the analysts' target, the
// scale the stock page's comparison strip draws them on, and the counts of the Desk's one status line.
// Pure functions, no React. `0` is a value; a missing number is null.

import type { AnalystTargetRow, OpusVerdict } from '@/lib/data-service';
import type { DeskRow } from './rankings';
import { aiVerdict, type AiSource } from './aiVerdict';
import { opusClaudeRange } from './opusText';
import { onList } from './sections';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const day = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null);

// ── The analysts' target ────────────────────────────────────────────────────

export interface AnalystTarget {
    mean: number;
    low: number | null;
    high: number | null;
    /** The day the target was read (`YYYY-MM-DD`); null when neither file says. */
    asOf: string | null;
    /** Where the target was read, as the file says it; null when it does not. */
    source: string | null;
    /** The target's currency when the file gives one; null means the file gives none (taken as the price currency). */
    currency: string | null;
    /** False when the target is in a currency other than the price's: it is shown, but never compared with the price. */
    comparable: boolean;
}

/**
 * The analysts' target of a name: analyst_targets.json's mean when that is a number, else the target carried in
 * opus_overlay.json, else none.
 */
export function analystTarget(
    file: { row: AnalystTargetRow | undefined; generatedAt?: string; source?: string },
    overlay: { opus: Pick<OpusVerdict, 'analyst' | 'currency'> | undefined; asOf?: string; source?: string },
): AnalystTarget | null {
    const f = file.row;
    if (f && num(f.mean)) {
        return {
            mean: f.mean, low: num(f.low) ? f.low : null, high: num(f.high) ? f.high : null,
            asOf: day(f.fetched_at) ?? day(file.generatedAt), source: file.source ?? null, currency: null, comparable: true,
        };
    }
    const o = overlay.opus;
    const a = o?.analyst;
    if (!o || !a || !num(a.target_mean)) return null;
    const currency = a.currency ?? o.currency;
    return {
        mean: a.target_mean, low: num(a.target_low) ? a.target_low : null, high: num(a.target_high) ? a.target_high : null,
        asOf: day(overlay.asOf), source: overlay.source ?? null, currency, comparable: currency === o.currency,
    };
}

// ── Our value ───────────────────────────────────────────────────────────────

export interface OurValue {
    /** The value the upside is measured from: the read's base value; Claude's range midpoint, else the code's median. */
    base: number;
    low: number | null;
    high: number | null;
    /** `scenarios`: low and high are the read's bear and bull; `range`: Claude's fair-value range; `runs`: the lowest and highest of the code's runs. */
    kind: 'scenarios' | 'range' | 'runs';
    source: AiSource;
    date: string | null;
    /** The source itself marked the value as far from the market price. */
    far: boolean;
    /** Claude's valuation says its currency; the read's values are per share in US dollars. */
    currency: string | null;
}

/** The value of the source that gave the row's AI verdict; null when there is no verdict or that source has no value. */
export function ourValue(r: Pick<DeskRow, 'geminiC' | 'opus'>): OurValue | null {
    const a = aiVerdict(r);
    if (!a || a.verdict === 'NO_CALL') return null;
    if (a.source === 'claude') {
        const o = r.opus;
        if (!o) return null;
        const rng = opusClaudeRange(o);
        if (rng) {
            return { base: (rng[0] + rng[1]) / 2, low: rng[0], high: rng[1], kind: 'range', source: a.source, date: day(o.review?.checked_on), far: false, currency: o.currency };
        }
        const median = o.value?.median;
        if (!num(median)) return null;
        return {
            base: median, low: num(o.value.low) ? o.value.low : null, high: num(o.value.high) ? o.value.high : null,
            kind: 'runs', source: a.source, date: day(o.captured_at) ?? day(o.price_date), far: false, currency: o.currency,
        };
    }
    const g = r.geminiC;
    if (!g || !g.valued || !num(g.value_base)) return null;
    return {
        base: g.value_base, low: num(g.value_bear) ? g.value_bear : null, high: num(g.value_bull) ? g.value_bull : null,
        kind: 'scenarios', source: a.source, date: day(g.date), far: g.far_from_price === true, currency: 'USD',
    };
}

/** Value over price minus one, as a fraction; null when either is missing or the price is not positive. */
export function upside(value: number | null | undefined, price: number | null | undefined): number | null {
    if (!num(value) || !num(price) || !(price > 0)) return null;
    return value / price - 1;
}

// ── The comparison strip's scale ────────────────────────────────────────────

export interface StripScale { lo: number; hi: number }

/** One scale for every mark of the strip: the smallest to the largest number given, with 8 % of the span on each side (a tenth of the value when there is one number only). Null when there is no number. */
export function stripScale(values: (number | null | undefined)[]): StripScale | null {
    const v = values.filter(num);
    if (v.length === 0) return null;
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const pad = hi > lo ? (hi - lo) * 0.08 : Math.abs(hi) * 0.1 || 1;
    return { lo: lo - pad, hi: hi + pad };
}

/** Where a number sits on the scale, in percent of its width, held inside 0 to 100. */
export function stripPos(v: number, s: StripScale): number {
    return Math.min(100, Math.max(0, ((v - s.lo) / (s.hi - s.lo)) * 100));
}

// ── The Desk's one status line ──────────────────────────────────────────────

export interface AiCounts {
    /** List names (research-now and watchlist bands) among the rows. */
    list: number;
    buy: number;
    watch: number;
    avoid: number;
    noCall: number;
    /** BUY + WATCH + AVOID: a no call is not a verdict. */
    verdicts: number;
    /** The day of the newest filings read that ran, `YYYY-MM-DD`; null when no list name has one. */
    newestRead: string | null;
}

/** What the status line says, counted over the list names from `aiVerdict`. */
export function aiCounts(rows: DeskRow[]): AiCounts {
    const c: AiCounts = { list: 0, buy: 0, watch: 0, avoid: 0, noCall: 0, verdicts: 0, newestRead: null };
    for (const r of rows) {
        if (!onList(r)) continue;
        c.list += 1;
        const v = aiVerdict(r)?.verdict;
        if (v === 'BUY') c.buy += 1;
        else if (v === 'WATCH') c.watch += 1;
        else if (v === 'AVOID') c.avoid += 1;
        else if (v === 'NO_CALL') c.noCall += 1;
        const d = r.geminiC && r.geminiC.analysis !== 'not run' ? day(r.geminiC.date) : null;
        if (d && (c.newestRead === null || d > c.newestRead)) c.newestRead = d;
    }
    c.verdicts = c.buy + c.watch + c.avoid;
    return c;
}
