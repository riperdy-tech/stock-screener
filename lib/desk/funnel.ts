// The Desk funnel: counts, the reasons behind each step, and the lists the step panels draw.
// Pure functions over DeskRow[] and the factor-scores header; no React, no i18n. A step only
// SELECTS a summary panel (operator ruling 5); none of this filters the table.

import type { FactorScoresPayload } from '@/lib/data-service';
import type { DeskPhase } from './phase';
import type { DeskRow } from './rankings';
import { doorOf, type Door } from './doors';
import { onList } from './sections';
import { rebuiltVerdict } from './verdict';

export interface FunnelCounts {
    /** Rows in `factor_scores.tickers`, vetoed included. */
    universe: number | null;
    /** `scored_count`: names that passed the safety filters. */
    scored: number | null;
    vetoed: number | null;
    /** research_now + watchlist band counts. */
    list: number | null;
    researchNowBand: number | null;
    watchlistBand: number | null;
    /** `band_counts.pass`: scored but cleared no door. */
    noDoor: number | null;
    /** Rebuilt-analyst verdicts on list names. */
    verdicts: number;
    /** Rebuilt-analyst rows with `actionable === true`. */
    actionable: number;
    /** List size minus rebuilt verdicts on list names; null while the list size is unknown. */
    queued: number | null;
}

export function funnelCounts(rows: DeskRow[], factor: FactorScoresPayload | null): FunnelCounts {
    const bc = factor?.band_counts;
    const list = bc && (bc.research_now != null || bc.watchlist != null)
        ? (bc.research_now ?? 0) + (bc.watchlist ?? 0) : null;
    const verdicts = rows.filter((r) => onList(r) && rebuiltVerdict(r.depth)).length;
    return {
        universe: factor ? Object.keys(factor.tickers).length : null,
        scored: factor?.scored_count ?? null,
        vetoed: bc?.vetoed ?? null,
        list,
        researchNowBand: bc?.research_now ?? null,
        watchlistBand: bc?.watchlist ?? null,
        noDoor: bc?.pass ?? null,
        verdicts,
        actionable: rows.filter((r) => rebuiltVerdict(r.depth)?.actionable === true).length,
        queued: list == null ? null : list - verdicts,
    };
}

/** Phase A: the drop-off under step 4 says the analyst is not live; otherwise how many are queued. */
export function step4DropOff(phase: DeskPhase | null, queued: number | null): 'notLive' | { queued: number } | null {
    if (phase === 'A') return 'notLive';
    return queued == null ? null : { queued };
}

export interface ReasonCount { code: string; count: number; detail: string | null }

/** Step 2: vetoed names grouped by `fct_veto`, biggest first. `detail` is the shared `fct_veto_detail` only when every name in the group has the same one. */
export function vetoGroups(factor: FactorScoresPayload | null): ReasonCount[] {
    const groups = new Map<string, { count: number; detail: string | null; mixed: boolean }>();
    for (const e of Object.values(factor?.tickers ?? {})) {
        if (e.fct_band !== 'vetoed' || !e.fct_veto) continue;
        const g = groups.get(e.fct_veto) ?? { count: 0, detail: e.fct_veto_detail ?? null, mixed: false };
        if ((e.fct_veto_detail ?? null) !== g.detail) g.mixed = true;
        g.count += 1;
        groups.set(e.fct_veto, g);
    }
    return Array.from(groups, ([code, g]) => ({ code, count: g.count, detail: g.mixed ? null : g.detail }))
        .sort((a, b) => b.count - a.count);
}

/** Step 5: how many REBUILT rows carry each `actionable_reasons` code, biggest first. */
export function gateReasonCounts(rows: DeskRow[]): { code: string; count: number }[] {
    const m = new Map<string, number>();
    for (const r of rows) {
        for (const code of rebuiltVerdict(r.depth)?.actionable_reasons ?? []) m.set(code, (m.get(code) ?? 0) + 1);
    }
    return Array.from(m, ([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

const byRank = (a: DeskRow, b: DeskRow) => (a.fct.fct_rank ?? Infinity) - (b.fct.fct_rank ?? Infinity);

/** Step 3: list names in screen-rank order, optionally one door only. */
export function listRows(rows: DeskRow[], door: Door | 'all' = 'all'): DeskRow[] {
    return rows
        .filter((r) => onList(r) && (door === 'all' || doorOf(r.fct.fct_nominated_doors) === door))
        .sort(byRank);
}

/** Step 4: list names with no rebuilt verdict, by screen rank. */
export function queueRows(rows: DeskRow[]): DeskRow[] {
    return rows.filter((r) => onList(r) && !rebuiltVerdict(r.depth)).sort(byRank);
}

/** What the ticker check says about one name, from the factor header only. */
export type TickerCheck =
    | { kind: 'unknown' }
    | { kind: 'vetoed'; code: string; detail: string | null }
    | { kind: 'scored'; band: string | null; rank: number | null };

/** One universe-search hit: the symbol, its company name (null when the price file has none) and the screen's verdict on it. */
export interface UniverseHit { symbol: string; name: string | null; check: TickerCheck }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Finds names in the screened universe by ticker OR company name (the funnel's first two steps list
 * "every US stock", so "nvidia" must find NVDA). Order: exact ticker, ticker prefix, name starts with,
 * name contains; at most `limit` hits. A name is matched against the price file's company name, so a
 * ticker with no price row is still found by its symbol only. Pure; reads the factor header and names.
 */
export function searchUniverse(
    factor: FactorScoresPayload | null,
    names: Record<string, { name?: string | null }> | null,
    query: string,
    limit = 6,
): UniverseHit[] {
    const raw = query.trim();
    if (!raw || !factor) return [];
    const sym = raw.toUpperCase();
    const q = norm(raw);
    const rank = (symbol: string, name: string | null): number => {
        if (symbol === sym) return 0;
        if (symbol.startsWith(sym)) return 1;
        const n = name ? norm(name) : '';
        if (q && n.startsWith(q)) return 2;
        if (q && (` ${n}`).includes(` ${q}`)) return 3;   // a word of the name starts with the query
        if (q.length >= 3 && n.includes(q)) return 4;
        return -1;
    };
    const hits: { r: number; symbol: string; name: string | null }[] = [];
    for (const symbol of Object.keys(factor.tickers)) {
        const name = names?.[symbol]?.name ?? null;
        const r = rank(symbol, name);
        if (r >= 0) hits.push({ r, symbol, name });
    }
    hits.sort((a, b) => a.r - b.r || a.symbol.localeCompare(b.symbol));
    return hits.slice(0, limit).map((h) => ({ symbol: h.symbol, name: h.name, check: checkTicker(factor, h.symbol)! }));
}

export function checkTicker(factor: FactorScoresPayload | null, ticker: string): TickerCheck | null {
    const key = ticker.trim().toUpperCase();
    if (!key || !factor) return null;
    const e = factor.tickers[key];
    if (!e) return { kind: 'unknown' };
    if (e.fct_band === 'vetoed' || e.fct_veto) return { kind: 'vetoed', code: e.fct_veto ?? 'unknown', detail: e.fct_veto_detail ?? null };
    return { kind: 'scored', band: e.fct_band, rank: e.fct_rank };
}
