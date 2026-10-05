// Reading a rebuilt-analyst verdict for the Desk. Pure functions, no React.
//
// The Desk shows rebuilt-analyst verdicts only (`isRebuiltRow`, lib/desk/phase.ts); an old-analyst
// row is treated as "no verdict" everywhere on the Desk. `direction` is the stored verdict and is
// never recomputed from a live price.

import type { DepthVerdict } from '@/lib/data-service';
import { isRebuiltRow } from './phase';

/** Overlay fields the Desk reads that are not (all) in the `DepthVerdict` contract type yet. */
export interface VerdictExtra {
    entry_timing?: string | null;
    entry_timing_now?: string | null;
    buy_paused?: boolean | null;
    buy_paused_reasons?: string[] | null;
    followup_asof?: string | null;
    watch_items?: unknown[] | null;
    thesis_status?: string | null;
    size_components?: Record<string, { bucket?: string | null } | null> | null;
    crux?: { input?: string; own?: number | null; implied?: number | null }[] | null;
}

export type DeskVerdict = DepthVerdict & VerdictExtra;

/** The row's verdict if the rebuilt analyst made it, else undefined (old-analyst rows are not shown). */
export function rebuiltVerdict(d: DepthVerdict | undefined): DeskVerdict | undefined {
    return d && isRebuiltRow(d) ? (d as DeskVerdict) : undefined;
}

/** Gate-on-read NOT_USABLE publishes `direction: null`, `status: 'not_usable'`; the legacy producer wrote 'NOT_USABLE'. */
export function isNotUsable(v: DepthVerdict): boolean {
    return v.direction == null || v.direction === 'NOT_USABLE' || v.status === 'not_usable';
}

/** True when the row carries any follow-up field (Phase C data). An absent field is not a value. */
export function hasFollowup(v: DeskVerdict): boolean {
    return v.followup_asof != null || v.buy_paused != null || v.entry_timing_now != null || v.watch_items != null;
}

const WAIT_TIMINGS = ['wait_for_momentum', 'avoid'];

/**
 * An actionable undervalued verdict that is held back: `buy_paused !== false` (unknown counts as
 * paused) or the live timing says wait/avoid. Only when the row has follow-up fields; without
 * them nothing is ever "waiting".
 */
export function isHeldBack(v: DeskVerdict): boolean {
    if (!hasFollowup(v)) return false;
    return v.buy_paused !== false || WAIT_TIMINGS.includes(v.entry_timing_now ?? '');
}
