// Verdict / size-hint vocabulary and colour mapping, shared by rankings rows,
// the detail hero and the portfolio verdict column.
//
// The pipeline emits `hold`; the desk displays FAIR. `NOT_USABLE` means every
// run was rejected by the plausibility guards — no band exists.

import type { DepthVerdict } from '@/lib/data-service';
import type { TRANSLATIONS } from '@/lib/i18n';

type Key = keyof typeof TRANSLATIONS['en'];

export type Direction = DepthVerdict['direction'];

export interface VerdictTone {
    label: string;      // FAIR / UNDERVALUED / OVERVALUED / NOT USABLE
    color: string;      // CSS colour for text, band fill and side borders
    fill: string;       // band segment fill (alpha differs per verdict in the design)
    subline: string;    // the one-line explanation under the verdict
    action: string;     // buy / hold / reduce
    /** i18n keys for the same three strings, for components that translate. */
    keys: { label: Key | null; subline: Key | null; action: Key | null };
}

// One meaning per colour — see tailwind.config.js for the full key. The values are CSS variables
// (app/globals.css), so the same constants render correctly on the dark legacy pages and in the
// desk's `.theme-light` scope.
const ACCENT = 'var(--accent)';  // the list / funnel progress, selection
const POS = 'var(--pos)';        // undervalued, gains, good
const FAIR = 'var(--fair)';      // fair: the neutral midpoint
const WARN = 'var(--warn)';      // warnings and caution
const NEG = 'var(--neg)';        // overvalued, losses, bad
const MUTED = 'var(--off)';      // doesn't count: blocked, vetoed, no data

/** A translucent fill of a token colour, for band segments. */
const mix = (token: string, pct: number) => `color-mix(in oklch, var(${token}) ${pct}%, transparent)`;

/** Door / score families: why the screen listed a stock. Same in both themes. */
export const FAMILY = {
    quality: '#a774d6', revisions: '#c0a2de',
    value: '#149c82', exp_gap: '#72bca8',
    momentum: '#fb9dbb',
} as const;

export function verdictTone(direction: Direction | null | undefined): VerdictTone {
    switch (direction) {
        case 'undervalued':
            return {
                label: 'UNDERVALUED', color: POS, fill: mix('--pos', 40),
                subline: 'every run above the price', action: 'buy',
                keys: { label: 'vUndervalued', subline: 'vSubUnder', action: 'actBuy' },
            };
        case 'overvalued':
            return {
                label: 'OVERVALUED', color: NEG, fill: mix('--neg', 42),
                subline: 'every run below the price', action: 'reduce',
                keys: { label: 'vOvervalued', subline: 'vSubOver', action: 'actReduce' },
            };
        case 'hold':
            return {
                label: 'FAIR', color: FAIR, fill: mix('--fair', 30),
                subline: 'price sits inside the band', action: 'hold',
                keys: { label: 'vFair', subline: 'vSubFair', action: 'actHold' },
            };
        case 'NOT_USABLE':
            return {
                label: 'NOT USABLE', color: MUTED, fill: 'var(--track)',
                subline: 'no plausible run', action: '—',
                keys: { label: 'vNotUsable', subline: 'vSubNone', action: null },
            };
        default:
            return {
                label: '—', color: MUTED, fill: 'var(--track)',
                subline: 'not yet analyzed', action: '—',
                keys: { label: null, subline: null, action: null },
            };
    }
}

/**
 * Hero band fill stays lighter than the row strip — the hero is 58px tall, so
 * the same alpha reads far heavier there. Both tiers were raised over the
 * handoff's .28/.22 and .16: at those values the shading barely separated from
 * the track on real screens.
 */
export function heroFill(direction: Direction | null | undefined): string {
    switch (direction) {
        case 'undervalued': return mix('--pos', 28);
        case 'overvalued': return mix('--neg', 30);
        case 'hold': return mix('--fair', 20);
        default: return 'var(--track)';
    }
}

export interface SizeTone {
    label: string;   // FULL / HALF / QUARTER / —
    color: string;
    note: string;    // explanation shown under the SIZE HINT stat
}

/**
 * Size hints come straight from the pipeline — the desk never recomputes the
 * spread tiers. Production cutoffs (~15% / ~30%) differ from the original
 * handoff assumption, and a single plausible run is capped at quarter.
 */
export function sizeTone(size: DepthVerdict['size_hint'] | null | undefined, nBasis?: number | null): SizeTone {
    switch (size) {
        case 'full':
            return { label: 'FULL', color: POS, note: 'runs agree tightly — full position' };
        case 'half':
            return { label: 'HALF', color: WARN, note: 'runs disagree on pace — half position' };
        case 'quarter':
            return {
                label: 'QUARTER', color: WARN,
                note: (nBasis ?? 0) < 2 ? 'one plausible run — size capped' : 'wide disagreement — quarter position',
            };
        default:
            return { label: '—', color: MUTED, note: 'no size hint — watchlist only' };
    }
}

/** Median gap colour: positive = cheap (green), negative = rich (red), FAIR = muted. */
export function gapColor(gap: number | null | undefined, direction?: Direction | null): string {
    if (gap === null || gap === undefined) return MUTED;
    if (direction === 'hold') return FAIR;
    if (gap > 0) return POS;
    if (gap < 0) return NEG;
    return MUTED;
}

export const TONE_COLORS = { ACCENT, POS, FAIR, WARN, NEG, MUTED };

/**
 * A verdict is a recommendation only when the gate passed it. `actionable ===
 * false` is a blocked verdict, kept for the record. Legacy rows without the
 * field are not blocked (fail-open, as before the gate existed).
 */
export const isBlocked = (d?: DepthVerdict) => d?.actionable === false;

/** A verdict that counts: the gate passed it. Legacy overlays carry no `actionable` field; there an
 * unblocked undervalued verdict is the actionable one. */
export const isActionable = (d?: DepthVerdict) =>
    !!d && (d.actionable === true || (d.actionable == null && d.direction === 'undervalued'));

/** Plain-English labels for the codes in `actionable_reasons`. */
export const GATE_REASON_LABEL: Record<string, string> = {
    not_usable: 'no usable run',
    'pre_v3.1_gates': 'made by the old analyst',
    pre_valid_analyst: 'made by the old analyst',
    single_sample: 'only one usable run',
    fiduciary_fail: 'failed the fiduciary audit',
    kelly_on_overvalued: 'sizing contradicts the verdict',
    high_dispersion: 'runs disagree too much',
    non_production_row: 'test run, not production',
    mode_instability: 'runs used different methods',
    outside_street_fence: "outside the analysts' price-target range",
    mos_beyond_150pct: 'implausibly far above the price',
    desk_not_used: 'calculator not used',
    low_effort_rescue: 'rushed valuation',
    sample_failed: 'a run failed',
    discovery_failed: 'research step failed',
    depleting_producer_unsupported: 'mine / oil & gas producer (not yet supported)',
    depleting_producer_class_unavailable: 'producer type unknown',
    consensus_data_unavailable: 'analyst data could not be fetched',
    no_street_fence: 'no analyst price-target range',
};

/** One reason code as text; unknown codes show as the code with `_` as spaces. */
export const gateReasonLabel = (code: string): string =>
    GATE_REASON_LABEL[code] ?? code.replace(/_/g, ' ');

export function gateReasonsText(reasons?: string[] | null): string {
    return (reasons ?? []).map(gateReasonLabel).join(' · ');
}

/**
 * Why the screen put a stock on the list, in one or two plain words. The compounder door reads as
 * "Quality", the value-gap door as "Value", the trend-leader door as "Trend"; a champion is both of
 * the first two. Wildcard and held-over are how a place was won, not why — they are explained on the
 * stock page only. Null when the stock was not nominated.
 */
export type Family = 'quality' | 'value' | 'momentum';

export function whyListed(doors: string[] | null | undefined): { label: string; help: string; parts: { family: Family; word: string }[] } | null {
    const d = doors ?? [];
    const champ = d.includes('DOUBLE_DOOR_CHAMPION');
    const parts: [string, string, Family][] = [];
    if (champ || d.includes('DOOR_1_COMPOUNDER')) parts.push(['Quality', 'a high-quality business with rising price and forecasts', 'quality']);
    if (champ || d.includes('DOOR_2_VALUE_GAP')) parts.push(['Value', 'cheap against the growth it has already delivered', 'value']);
    if (d.includes('DOOR_3_TREND_LEADER')) parts.push(['Trend', 'a strong, steady, profitable uptrend', 'momentum']);
    if (parts.length === 0) {
        return d.includes('HYSTERESIS_RETAINED')
            ? { label: 'Held over', help: 'already on the list; its rank slipped, but not far enough to drop it', parts: [] }
            : null;
    }
    const label = parts.map(([l], i) => (i === 0 ? l : l.toLowerCase())).join(' + ');
    const help = champ
        ? 'in the top 10% both as a quality business and as a value opportunity, which is rare'
        : parts.map(([, h]) => h).join('; and ');
    return { label, help, parts: parts.map(([w, , f]) => ({ family: f, word: w })) };
}

/** Quant-screen flags that are warnings on the name (never a gate). */
export const FORENSIC_WARNINGS: Record<string, string> = {
    insolvency_distress_altman_z: 'Altman Z distress (warning only)',
    forensic_red_flag: 'accruals red flag',
    beneish_flag: 'Beneish M-score flag',
    heavy_accruals: 'heavy accruals',
    heavy_issuance: 'heavy share issuance',
    loss_making_leveraged: 'loss-making and leveraged',
    falling_knife: 'falling knife (steep price decline)',
    stale_annual_data: 'stale annual filing',
    below_min_adv: 'thin trading volume',
};

/** Quant-screen flags that only say a data input was missing or approximated. */
export const DATA_NOTES: Record<string, string> = {
    momentum_proxy_monthly: 'momentum from monthly prices',
    no_liquidity_data: 'no volume data yet',
    beneish_unverifiable: 'Beneish not computable',
    revisions_missing: 'no estimate revisions',
    mom_break_unverified_monthly_trend_ok: 'trend-break check on monthly data',
    adv_missing: 'no volume data',
    mcap_derived: 'market cap derived',
    mid_cycle_short_history: 'short history for mid-cycle average',
    momentum_missing: 'no momentum data',
};
