// Verdict / size-hint vocabulary and colour mapping, shared by rankings rows,
// the detail hero and the portfolio verdict column.
//
// The pipeline emits `hold`; the desk displays FAIR. `NOT_USABLE` means every
// seeded run was rejected by the plausibility guards — no band exists.

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
const NEG = '#c2695a';
const MUTED = '#8b887f';

export function verdictTone(direction: Direction | null | undefined): VerdictTone {
    switch (direction) {
        case 'undervalued':
            return {
                label: 'UNDERVALUED', color: POS, fill: 'oklch(0.75 0.11 155 / .28)',
                subline: 'every run above the price', action: 'buy',
                keys: { label: 'vUndervalued', subline: 'vSubUnder', action: 'actBuy' },
            };
        case 'overvalued':
            return {
                label: 'OVERVALUED', color: NEG, fill: 'rgba(194,105,90,.22)',
                subline: 'every run below the price', action: 'reduce',
                keys: { label: 'vOvervalued', subline: 'vSubOver', action: 'actReduce' },
            };
        case 'hold':
            return {
                label: 'FAIR', color: WARN, fill: 'rgba(207,161,78,.22)',
                subline: 'price sits inside the band', action: 'hold',
                keys: { label: 'vFair', subline: 'vSubFair', action: 'actHold' },
            };
        case 'NOT_USABLE':
            return {
                label: 'NOT USABLE', color: MUTED, fill: 'rgba(255,255,255,.06)',
                subline: 'no plausible run', action: '—',
                keys: { label: 'vNotUsable', subline: 'vSubNone', action: null },
            };
        default:
            return {
                label: '—', color: MUTED, fill: 'rgba(255,255,255,.06)',
                subline: 'not yet analyzed', action: '—',
                keys: { label: null, subline: null, action: null },
            };
    }
}

/** Hero band fill is lighter than the row strip (design: .16 vs .28/.22). */
export function heroFill(direction: Direction | null | undefined): string {
    switch (direction) {
        case 'undervalued': return 'oklch(0.75 0.11 155 / .16)';
        case 'overvalued': return 'rgba(194,105,90,.16)';
        case 'hold': return 'rgba(207,161,78,.16)';
        default: return 'rgba(255,255,255,.05)';
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
