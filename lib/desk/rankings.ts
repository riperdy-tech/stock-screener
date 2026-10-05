// Row model for the three rankings lenses.
//
// One DeskRow joins everything known about a ticker: the quant filter entry, the
// depth (band-direction) verdict when one exists, the reverse-DCF model, and the
// overlay signals. The lenses only choose ordering and which columns to show.

import type { BandTransitions, DepthVerdict, FactorEntry, ValuationModel } from '@/lib/data-service';
import type { StockInfo } from './useDeskData';
import { isActionable, isBlocked } from './tone';

export type BandMove = 'entered_rn' | 'left_rn' | 'entered_book' | 'left_book';

const BAND_MOVES: BandMove[] = ['entered_rn', 'left_rn', 'entered_book', 'left_book'];

export interface DeskRow {
    ticker: string;
    info: StockInfo | undefined;
    fct: FactorEntry;
    depth: DepthVerdict | undefined;
    /** `mos_vs_median_pct` exactly as stored in the overlay; `depth.mos_vs_median_pct` is re-marked to the live price. */
    storedMos: number | null;
    val: ValuationModel | undefined;
    overlay: any;
    /** 1..N among unblocked undervalued names, by median gap. Undefined otherwise. */
    aiRank?: number;
    /** Percentile points of disagreement carried by the retired conviction overlay, or null. */
    delta: number | null;
    /**
     * Promotion/demotion under the BAND scheme, derived here rather than read from
     * `fct_llm` — that flag is written by the retired conviction/MoS overlay and
     * would contradict the depth verdict shown next to it.
     */
    promo: 'promoted' | 'demoted' | 'none';
    vetoed: boolean;
    vetoReason: string | null;
    /** Where the name moved between bands in the latest screen run (first match), or null. */
    moved: BandMove | null;
    /** Institutional Underwriting Contract metrics */
    conviction?: number | null;
    moat?: number | null;
    kelly?: number | null;
    skew?: number | null;
    bearIv?: number | null;
    bullIv?: number | null;
}

export interface RankingFilters {
    search: string;
    stage: FunnelStage;
    band: string;      // 'all' | research_now | watchlist | pass | vetoed
    verdict: string;   // 'all' | analyzed | undervalued | fair | overvalued | not_usable | blocked | promoted | demoted | vetoed | consensus_2 | escalated_3
    sector: string;
    industry: string;
}

export const EMPTY_FILTERS: RankingFilters = { search: '', stage: 'all', band: 'all', verdict: 'all', sector: 'all', industry: 'all' };

/** The funnel's steps, widest first. Each step is a subset of the one before it, except that a
 * verdict can outlive its stock's place on the list. */
export type FunnelStage = 'all' | 'scored' | 'list' | 'verdict' | 'gate';

export const FUNNEL_STAGES: { id: FunnelStage; label: string }[] = [
    { id: 'all', label: 'US stocks checked' },
    { id: 'scored', label: 'pass the safety filters' },
    { id: 'list', label: 'make the list' },
    { id: 'verdict', label: 'AI verdicts on record' },
    { id: 'gate', label: 'pass the gate' },
];

/** One rule for both the funnel's counts and the list it filters, so the two always agree. */
export function inStage(r: DeskRow, stage: FunnelStage): boolean {
    const inScreen = r.fct.fct_rank != null;
    switch (stage) {
        case 'all': return true;
        case 'scored': return inScreen && r.fct.fct_band !== 'vetoed' && !r.vetoed;
        case 'list': return inScreen && (r.fct.fct_band === 'research_now' || r.fct.fct_band === 'watchlist');
        case 'verdict': return !!r.depth;
        case 'gate': return isActionable(r.depth);
    }
}

export interface RankingsInput {
    factor: { tickers: Record<string, FactorEntry>; band_transitions?: BandTransitions | null } | null;
    depth: Record<string, DepthVerdict>;
    valuations: Record<string, ValuationModel>;
    overlay: Record<string, any>;
    stockInfo: Record<string, StockInfo>;
}

/**
 * Enriches depth verdict with mark-to-market live price and dynamic Margin of Safety.
 * The stored `direction` is the verdict and is never re-derived from the live price;
 * the price the verdict was made at rides along as `verdict_price`.
 */
function enrichDepth(rawD: DepthVerdict | undefined, info: StockInfo | undefined): DepthVerdict | undefined {
    if (!rawD) return undefined;
    const livePrice = info?.price && info.price > 0 ? info.price : rawD.price ?? null;
    const liveMos = (rawD.median_iv != null && livePrice != null && livePrice > 0)
        ? ((rawD.median_iv - livePrice) / livePrice) * 100
        : rawD.mos_vs_median_pct ?? null;

    return {
        ...rawD,
        price: livePrice,
        mos_vs_median_pct: liveMos,
        verdict_price: rawD.price ?? null,
    };
}

/** Every scored ticker, quant order, with the depth verdict attached where it exists.
 * Tickers with active depth underwritings are always included even if fct_rank is null.
 */
export function buildRows({ factor, depth, valuations, overlay, stockInfo }: RankingsInput): DeskRow[] {
    if (!factor) return [];

    const depthTickers = new Set(Object.keys(depth || {}));
    const includedTickers = new Set<string>();
    const rows: DeskRow[] = [];
    const transitions = factor.band_transitions ?? null;
    const movedOf = (ticker: string): BandMove | null =>
        BAND_MOVES.find((k) => transitions?.[k]?.includes(ticker)) ?? null;

    // 1. Every ticker the screen checked, including the ones the safety filters removed (no rank) -
    // the funnel's first step lists them all.
    for (const [ticker, fct] of Object.entries(factor.tickers)) {

        includedTickers.add(ticker);
        const pl = (fct as any).fct_percentile_llm;
        const p = (fct as any).fct_percentile;
        const d = enrichDepth(depth[ticker], stockInfo[ticker]);
        const sc = d?.scorecard;

        rows.push({
            ticker,
            info: stockInfo[ticker],
            fct,
            depth: d,
            storedMos: depth[ticker]?.mos_vs_median_pct ?? null,
            val: valuations[ticker],
            overlay: overlay[ticker],
            delta: (pl != null && p != null) ? Math.round(pl - p) : null,
            promo: 'none',
            vetoed: !!(fct.fct_veto || (fct as any).fct_llm_veto),
            vetoReason: (fct.fct_veto_detail as string) || (fct.fct_veto as string) || null,
            moved: movedOf(ticker),
            conviction: d?.conviction_score ?? sc?.median_conviction_score ?? null,
            moat: d?.business_quality_moat ?? sc?.median_quality_moat ?? null,
            kelly: d?.kelly_fraction_pct ?? sc?.median_kelly_fraction_pct ?? null,
            skew: d?.asymmetric_payoff_skew ?? sc?.asymmetric_payoff_skew ?? null,
            bearIv: d?.bear_iv ?? sc?.median_bear_iv ?? null,
            bullIv: d?.bull_iv ?? sc?.median_bull_iv ?? null,
        });
    }

    // 2. Ensure any ticker present in depth that was not in factor.tickers is included
    for (const ticker of Array.from(depthTickers)) {
        if (includedTickers.has(ticker)) continue;
        const d = enrichDepth(depth[ticker], stockInfo[ticker]);
        const sc = d?.scorecard;
        const fallbackFct: FactorEntry = {
            fct_composite: null,
            fct_percentile: null,
            fct_band: 'watchlist',
            fct_rank: null,
            fct_veto: null,
            fct_z: null,
            fct_contributions: null,
            fct_haircuts: null,
        };
        rows.push({
            ticker,
            info: stockInfo[ticker],
            fct: fallbackFct,
            depth: d,
            storedMos: depth[ticker]?.mos_vs_median_pct ?? null,
            val: valuations[ticker],
            overlay: overlay[ticker],
            delta: null,
            promo: 'promoted',
            vetoed: false,
            vetoReason: null,
            moved: movedOf(ticker),
            conviction: d?.conviction_score ?? sc?.median_conviction_score ?? null,
            moat: d?.business_quality_moat ?? sc?.median_quality_moat ?? null,
            kelly: d?.kelly_fraction_pct ?? sc?.median_kelly_fraction_pct ?? null,
            skew: d?.asymmetric_payoff_skew ?? sc?.asymmetric_payoff_skew ?? null,
            bearIv: d?.bear_iv ?? sc?.median_bear_iv ?? null,
            bullIv: d?.bull_iv ?? sc?.median_bull_iv ?? null,
        });
    }

    // Sort by quant rank (unranked names placed at the bottom of quant sorting)
    rows.sort((a, b) => (a.fct.fct_rank ?? 1e9) - (b.fct.fct_rank ?? 1e9));

    // AI rank: the depth engine has no rank of its own, so the desk ranks the
    // names it called undervalued (and the gate passed) by how far the price
    // sits below the median IV.
    rows
        .filter((r) => r.depth?.direction === 'undervalued' && !isBlocked(r.depth))
        .sort((a, b) => (b.depth?.mos_vs_median_pct ?? -1e9) - (a.depth?.mos_vs_median_pct ?? -1e9))
        .forEach((r, i) => { r.aiRank = i + 1; });

    // Promotion is the AI disagreeing with the shortlist in either direction:
    // it valued a non-shortlisted name above its price, or it knocked a
    // shortlisted name out by valuing it below the price.
    for (const r of rows) {
        if (!r.depth || isBlocked(r.depth)) continue;
        const shortlisted = r.fct.fct_band === 'research_now';
        if (r.depth.direction === 'undervalued' && !shortlisted) r.promo = 'promoted';
        else if (r.depth.direction === 'overvalued' && shortlisted) r.promo = 'demoted';
    }

    return rows;
}

export function sectorsOf(rows: DeskRow[]): string[] {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.info?.sector) set.add(r.info.sector); });
    return Array.from(set).sort();
}

export function industriesOf(rows: DeskRow[], sector?: string): string[] {
    const set = new Set<string>();
    rows.forEach((r) => {
        if (r.info?.industry && r.info.industry !== 'Unknown' && r.info.industry !== '—') {
            if (!sector || sector === 'all' || r.info?.sector === sector) {
                set.add(r.info.industry);
            }
        }
    });
    return Array.from(set).sort();
}

export function applyFilters(rows: DeskRow[], f: RankingFilters): DeskRow[] {
    const q = f.search.trim().toUpperCase();
    return rows.filter((r) => {
        if (!inStage(r, f.stage)) return false;
        if (f.band !== 'all' && r.fct.fct_band !== f.band) return false;
        if (f.sector !== 'all' && r.info?.sector !== f.sector) return false;
        if (f.industry && f.industry !== 'all' && r.info?.industry !== f.industry) return false;
        if (f.verdict !== 'all') {
            const d = r.depth?.direction;
            switch (f.verdict) {
                case 'analyzed': if (!r.depth) return false; break;
                case 'undervalued': if (d !== 'undervalued') return false; break;
                case 'fair': if (d !== 'hold') return false; break;
                case 'overvalued': if (d !== 'overvalued') return false; break;
                case 'not_usable': if (d !== 'NOT_USABLE') return false; break;
                case 'blocked': if (!isBlocked(r.depth)) return false; break;
                case 'promoted': if (r.promo !== 'promoted') return false; break;
                case 'demoted': if (r.promo !== 'demoted') return false; break;
                case 'wide_moat': if (r.moat == null || r.moat < 4.0) return false; break;
                case 'high_conviction': if (r.conviction == null || r.conviction < 12) return false; break;
                case 'asymmetric': if (r.skew == null || r.skew < 1.5) return false; break;
                case 'consensus_2': if ((r.depth?.samples_run ?? r.depth?.n_basis) !== 2) return false; break;
                case 'escalated_3': if ((r.depth?.samples_run ?? r.depth?.n_basis) !== 3) return false; break;
                case 'vetoed': if (!r.vetoed) return false; break;
            }
        }
        if (q && !r.ticker.includes(q) && !(r.info?.name ?? '').toUpperCase().includes(q)) return false;
        return true;
    });
}

export interface AiSections {
    researchNow: DeskRow[];   // price below the whole band — the AI's shortlist
    watchlist: DeskRow[];     // analyzed and gate-passed, price inside or above the band
    blocked: DeskRow[];       // verdict on record but failed the gate — not a recommendation
    awaiting: DeskRow[];      // quant shortlist, depth run not done yet
    vetoed: DeskRow[];        // disqualified before the depth run
}

/**
 * The RS2 AI lens. Only depth-analyzed names carry a verdict; the quant
 * shortlist that has not been through a depth run is shown separately rather
 * than silently dropped — 14–18 of 51 research_now names are analyzed today.
 */
export function aiSections(rows: DeskRow[]): AiSections {
    const researchNow: DeskRow[] = [];
    const watchlist: DeskRow[] = [];
    const blocked: DeskRow[] = [];
    const awaiting: DeskRow[] = [];
    const vetoed: DeskRow[] = [];

    for (const r of rows) {
        // If a ticker has an active depth underwriting, the depth model's institutional contract
        // takes precedence over any preliminary heuristic quant veto:
        if (r.depth) {
            // Gate-on-read NOT_USABLE publishes direction: null, status: 'not_usable';
            // the legacy producer instead wrote the literal string 'NOT_USABLE'. Both
            // are "no plausible verdict" and belong with the disqualified names, not
            // silently in the watchlist.
            if (r.depth.direction == null || r.depth.direction === 'NOT_USABLE' || r.depth.status === 'not_usable') {
                vetoed.push(r);
            } else if (isBlocked(r.depth)) {
                // actionable === false: the verdict failed the gate and is shown
                // for the record only. Rows without the actionable field (legacy
                // overlays) are not blocked.
                blocked.push(r);
            } else if (r.depth.direction === 'undervalued') {
                researchNow.push(r);
            } else {
                watchlist.push(r);
            }
            continue;
        }

        // If not underwritten yet, check if disqualified by preliminary quant veto:
        if (r.vetoed) {
            if (r.fct.fct_band === 'research_now' || r.fct.fct_rank) vetoed.push(r);
            continue;
        }

        // Shortlisted names awaiting depth run:
        if (r.fct.fct_band === 'research_now') awaiting.push(r);
    }

    researchNow.sort((a, b) => (a.aiRank ?? 1e9) - (b.aiRank ?? 1e9));
    // Watchlist: FAIR first (closest to actionable), then overvalued, then unusable.
    const wlOrder: Record<string, number> = { hold: 0, overvalued: 1, NOT_USABLE: 2 };
    watchlist.sort((a, b) => {
        const oa = wlOrder[a.depth?.direction ?? ''] ?? 3;
        const ob = wlOrder[b.depth?.direction ?? ''] ?? 3;
        if (oa !== ob) return oa - ob;
        return (b.depth?.mos_vs_median_pct ?? -1e9) - (a.depth?.mos_vs_median_pct ?? -1e9);
    });

    blocked.sort((a, b) => (b.depth?.mos_vs_median_pct ?? -1e9) - (a.depth?.mos_vs_median_pct ?? -1e9));

    return { researchNow, watchlist, blocked, awaiting, vetoed };
}

/**
 * Signed rank move vs the quant filter. Positive = the AI ranks it higher than
 * the math does. Only depth-analyzed names carry an AI rank, so names the AI
 * pushed down have no rank to compare and report null.
 */
export function rankDelta(r: DeskRow): number | null {
    if (r.aiRank && r.fct.fct_rank) return r.fct.fct_rank - r.aiRank;
    return null;
}
