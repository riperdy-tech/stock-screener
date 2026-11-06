// Which section of the Desk each name belongs in. Pure functions, no React.
//
// Since 2026-11-06 the Desk follows the screener's own list, with Qwen's analysis beside each name
// (operator: research-now and watchlist names get the AI analysis). The old depth analyst's
// verdicts (depth_overlay.json, last run 2026-10-06) no longer place names.
//
//   vetoed (fct_veto / fct_llm_veto), on the list or ranked -> Disqualified
//   research_now band                                         -> Research now (by screen rank)
//   watchlist band                                            -> Awaiting, shown as "Watchlist" (by screen rank)
//
// Waiting, No edge and Blocked stay in the type for the stock page's section lookup and are empty.
// Annotate, never silently gate: a name Qwen could not value keeps its row and says why.

import type { DeskRow } from './rankings';
import { rebuiltVerdict } from './verdict';

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


const byRank = (a: DeskRow, b: DeskRow) => nullsLast(a.fct.fct_rank, b.fct.fct_rank, 1);

export function deskSections(rows: DeskRow[]): DeskSections {
    const s: DeskSections = { researchNow: [], waiting: [], noEdge: [], blocked: [], awaiting: [], disqualified: [] };

    for (const r of rows) {
        if (r.vetoed && (onList(r) || r.fct.fct_rank != null)) s.disqualified.push(r);
        else if (r.fct.fct_band === 'research_now') s.researchNow.push(r);
        else if (r.fct.fct_band === 'watchlist') s.awaiting.push(r);
    }

    s.researchNow.sort(byRank);
    s.awaiting.sort(byRank);
    s.disqualified.sort(byRank);
    return s;
}

/** Old-analyst verdicts present in the overlay: kept off the Desk, shown only as a count. */
export function countHiddenLegacy(rows: DeskRow[]): number {
    return rows.filter((r) => r.depth && !rebuiltVerdict(r.depth)).length;
}
