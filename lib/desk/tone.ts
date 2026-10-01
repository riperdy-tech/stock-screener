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

const ACCENT = 'oklch(0.78 0.08 250)';
const POS = 'oklch(0.75 0.11 155)';
const WARN = '#cfa14e';
const NEG = '#e2917f';
const MUTED = '#d3cfc5';

export function verdictTone(direction: Direction | null | undefined): VerdictTone {
    switch (direction) {
        case 'undervalued':
            return {
                label: 'UNDERVALUED', color: POS, fill: 'oklch(0.75 0.11 155 / .48)',
                subline: 'every run above the price', action: 'buy',
                keys: { label: 'vUndervalued', subline: 'vSubUnder', action: 'actBuy' },
            };
        case 'overvalued':
            return {
                label: 'OVERVALUED', color: NEG, fill: 'rgba(226,145,127,.44)',
                subline: 'every run below the price', action: 'reduce',
                keys: { label: 'vOvervalued', subline: 'vSubOver', action: 'actReduce' },
            };
        case 'hold':
            return {
                label: 'FAIR', color: WARN, fill: 'rgba(207,161,78,.44)',
                subline: 'price sits inside the band', action: 'hold',
                keys: { label: 'vFair', subline: 'vSubFair', action: 'actHold' },
            };
        case 'NOT_USABLE':
            return {
                label: 'NOT USABLE', color: MUTED, fill: 'rgba(255,255,255,.12)',
                subline: 'no plausible run', action: '—',
                keys: { label: 'vNotUsable', subline: 'vSubNone', action: null },
            };
        default:
            return {
                label: '—', color: MUTED, fill: 'rgba(255,255,255,.12)',
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
        case 'undervalued': return 'oklch(0.75 0.11 155 / .32)';
        case 'overvalued': return 'rgba(226,145,127,.3)';
        case 'hold': return 'rgba(207,161,78,.3)';
        default: return 'rgba(255,255,255,.12)';
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
            return { label: 'FULL', color: ACCENT, note: 'runs agree tightly — full position' };
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
    if (direction === 'hold') return MUTED;
    if (gap > 0) return POS;
    if (gap < 0) return NEG;
    return MUTED;
}

export const TONE_COLORS = { ACCENT, POS, WARN, NEG, MUTED };

/**
 * A verdict is a recommendation only when the gate passed it. `actionable ===
 * false` is a blocked verdict, kept for the record. Legacy rows without the
 * field are not blocked (fail-open, as before the gate existed).
 */
export const isBlocked = (d?: DepthVerdict) => d?.actionable === false;

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

/** Door codes in display order, with the short chip label and the plain-English help sentence. */
export const DOOR_LABEL: Record<string, string> = {
    DOOR_1_COMPOUNDER: 'COMPOUNDER',
    DOOR_2_VALUE_GAP: 'VALUE GAP',
    DOOR_3_TREND_LEADER: 'TREND LEADER',
    DOUBLE_DOOR_CHAMPION: 'CHAMPION',
    GLOBAL_WILDCARD: 'WILDCARD',
    HYSTERESIS_RETAINED: 'HELD OVER',
};

export const DOOR_HELP: Record<string, string> = {
    DOOR_1_COMPOUNDER: 'High quality with rising momentum and estimates',
    DOOR_2_VALUE_GAP: 'Cheap against its own demonstrated growth',
    DOOR_3_TREND_LEADER: 'A strong, steady, profitable uptrend',
    DOUBLE_DOOR_CHAMPION: 'Top 10% through both the compounder and value-gap doors',
    GLOBAL_WILDCARD: "Won a place outside its sector's quota on overall strength",
    HYSTERESIS_RETAINED: 'Already on the list; stays until it falls clearly out',
};

const DOOR_ORDER = Object.keys(DOOR_LABEL);

/** One door code as chip text; unknown codes show lower-cased with `_` as spaces. */
export const doorLabel = (code: string): string => DOOR_LABEL[code] ?? code.toLowerCase().replace(/_/g, ' ');

/** The row's door codes in display order; unknown codes follow, in their original order. */
export function orderedDoors(doors: string[] | null | undefined): string[] {
    const list = doors ?? [];
    const known = DOOR_ORDER.filter((c) => list.includes(c));
    return [...known, ...list.filter((c) => !DOOR_ORDER.includes(c))];
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
