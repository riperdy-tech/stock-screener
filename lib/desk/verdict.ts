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
    crux?: { input?: string; own?: number | null; implied?: number | null; at_default?: boolean | null; reason?: string | null }[] | null;
    crux_valid?: boolean | null;
    /** Reverse-solved inputs: `reachable === false` means no value of that input alone explains the price. `own` can be a string ("unlimited"). */
    price_implied?: Record<string, { value?: number | null; reachable?: boolean | null; own?: number | string | null } | null> | null;
    street_fence?: { low?: number | null; high?: number | null } | null;
    instability?: { prior_iv?: number | null; current_iv?: number | null; delta_pct?: number | null; unstable?: boolean | null } | null;
    followup_status?: string | null;
    momentum_view?: string | null;
    momentum_flip_condition?: RuleObject | null;
    momentum_break_rule?: RuleObject | null;
    invalidation_rules?: RuleObject[] | null;
    thesis_checks?: (RuleObject & { current_value?: number | null; breached?: boolean | null })[] | null;
    coe_used?: number | null;
    coe_source?: string | null;
    coe_minus_anchor?: number | null;
    terminal_method?: string | null;
    terminal_multiple_or_g?: number | null;
    fade_years?: number | null;
    terminal_ronic?: number | string | null;
    desk_calls?: number | null;
    desk_iv_match?: boolean | null;
    fiduciary_verdict?: string | null;
    fiduciary_violations?: unknown[] | null;
    research_brief_asof?: string | null;
    research_brief_age_days?: number | null;
    price_asof?: string | null;
    price_source?: string | null;
}

/** A machine-checkable rule: momentum conditions carry `window_days`, invalidation rules carry a `window` phrase. */
export interface RuleObject {
    metric?: string | null;
    comparator?: string | null;
    threshold?: number | null;
    window_days?: number | null;
    window?: string | null;
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
