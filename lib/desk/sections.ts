// Which section of the Desk each name belongs in. Pure functions, no React.
//
// Only REBUILT-analyst verdicts count (rebuiltVerdict). A name whose only verdict is the old
// analyst's is treated as having none. Every name lands in exactly one section, or in none when
// it is neither on the list nor vetoed nor carrying a rebuilt verdict (it is simply not on the Desk).
//
//   rebuilt verdict, not usable (direction null / NOT_USABLE / status not_usable) -> Blocked
//   rebuilt verdict, actionable !== true                                          -> Blocked
//   actionable + undervalued, held back (follow-up fields only)                   -> Waiting
//   actionable + undervalued                                                      -> Research now
//   actionable + hold / overvalued                                                -> No edge today
//   no rebuilt verdict, vetoed (fct_veto / fct_llm_veto) on the list              -> Disqualified
//   no rebuilt verdict, on the list (research_now / watchlist band)               -> Awaiting
//
// Annotate, never silently gate: nothing is dropped here; a name that fails the gate is Blocked
// and keeps its row.

import type { DeskRow } from './rankings';
import { isHeldBack, isNotUsable, rebuiltVerdict } from './verdict';

export interface DeskSections {
    researchNow: DeskRow[];
    waiting: DeskRow[];
    noEdge: DeskRow[];
    blocked: DeskRow[];
    awaiting: DeskRow[];
    disqualified: DeskRow[];
}

/** On the screen's list: the research_now or watchlist band. (The band is the screen's own name; it is not the Desk section "No edge today".) */
export const onList = (r: DeskRow): boolean =>
    r.fct.fct_band === 'research_now' || r.fct.fct_band === 'watchlist';

/** Numeric compare with nulls last (`0` is a value, so no `||`). */
const nullsLast = (x: number | null, y: number | null, dir: 1 | -1): number =>
    x == null ? (y == null ? 0 : 1) : y == null ? -1 : dir * (x - y);

const byMosDesc = (a: DeskRow, b: DeskRow) => nullsLast(a.storedMos, b.storedMos, -1);

const byRank = (a: DeskRow, b: DeskRow) => nullsLast(a.fct.fct_rank, b.fct.fct_rank, 1);

export function deskSections(rows: DeskRow[]): DeskSections {
    const s: DeskSections = { researchNow: [], waiting: [], noEdge: [], blocked: [], awaiting: [], disqualified: [] };

    for (const r of rows) {
        const v = rebuiltVerdict(r.depth);
        if (v) {
            if (isNotUsable(v) || v.actionable !== true) s.blocked.push(r);
            else if (v.direction === 'undervalued') (isHeldBack(v) ? s.waiting : s.researchNow).push(r);
            else s.noEdge.push(r);
            continue;
        }
        if (r.vetoed && (onList(r) || r.fct.fct_rank != null)) s.disqualified.push(r);
        else if (onList(r)) s.awaiting.push(r);
    }

    s.researchNow.sort(byMosDesc);
    s.waiting.sort(byMosDesc);
    // No edge today: FAIR first (closest to a call), then overvalued, then by margin of safety.
    const order: Record<string, number> = { hold: 0, overvalued: 1 };
    s.noEdge.sort((a, b) => {
        const oa = order[a.depth?.direction ?? ''] ?? 2;
        const ob = order[b.depth?.direction ?? ''] ?? 2;
        return oa !== ob ? oa - ob : byMosDesc(a, b);
    });
    s.blocked.sort(byMosDesc);
    s.awaiting.sort(byRank);
    s.disqualified.sort(byRank);
    return s;
}

/** Old-analyst verdicts present in the overlay: kept off the Desk, shown only as a count. */
export function countHiddenLegacy(rows: DeskRow[]): number {
    return rows.filter((r) => r.depth && !rebuiltVerdict(r.depth)).length;
}
