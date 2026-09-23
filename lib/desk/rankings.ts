// Row model for the three rankings lenses.
//
// One DeskRow joins everything known about a ticker: the quant filter entry, the
// depth (band-direction) verdict when one exists, the reverse-DCF model, and the
// overlay signals. The lenses only choose ordering and which columns to show.

import type { DepthVerdict, FactorEntry, ValuationModel } from '@/lib/data-service';
import type { StockInfo } from './useDeskData';

export interface DeskRow {
    ticker: string;
    info: StockInfo | undefined;
    fct: FactorEntry;
    depth: DepthVerdict | undefined;
    val: ValuationModel | undefined;
    overlay: any;
    /** 1..N among depth-analyzed undervalued names, by median gap. Undefined otherwise. */
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
    /** Section 12 Institutional Underwriting Contract metrics */
    conviction?: number | null;
    moat?: number | null;
    kelly?: number | null;
    skew?: number | null;
    bearIv?: number | null;
    bullIv?: number | null;
}

export interface RankingFilters {
    search: string;
    band: string;      // 'all' | research_now | watchlist | monitor | pass
    verdict: string;   // 'all' | analyzed | undervalued | fair | overvalued | not_usable | promoted | demoted | vetoed | consensus_2 | escalated_3
    sector: string;
    industry: string;
}

export const EMPTY_FILTERS: RankingFilters = { search: '', band: 'all', verdict: 'all', sector: 'all', industry: 'all' };

export interface RankingsInput {
    factor: { tickers: Record<string, FactorEntry> } | null;
    depth: Record<string, DepthVerdict>;
    valuations: Record<string, ValuationModel>;
    overlay: Record<string, any>;
    stockInfo: Record<string, StockInfo>;
}

/** Enriches depth verdict with mark-to-market live price and dynamic Margin of Safety */
function enrichDepth(rawD: DepthVerdict | undefined, info: StockInfo | undefined): DepthVerdict | undefined {
    if (!rawD) return undefined;
    const livePrice = info?.price && info.price > 0 ? info.price : rawD.price ?? null;
    const liveMos = (rawD.median_iv != null && livePrice != null && livePrice > 0)
        ? ((rawD.median_iv - livePrice) / livePrice) * 100
        : rawD.mos_vs_median_pct ?? null;

    let liveDirection = rawD.direction;
    // A null direction (gate-on-read NOT_USABLE) is an absence, not a verdict to
    // recompute against — the live price/band comparison must not resurrect one.
    if (rawD.direction != null && livePrice != null && rawD.iv_band_low != null && rawD.iv_band_high != null) {
        if (livePrice < rawD.iv_band_low) liveDirection = 'undervalued';
        else if (livePrice > rawD.iv_band_high) liveDirection = 'overvalued';
        else liveDirection = 'hold';
    }

    return {
        ...rawD,
        price: livePrice,
        mos_vs_median_pct: liveMos,
        direction: liveDirection,
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

    // 1. Process factor tickers that have a valid rank OR have an active depth report
    for (const [ticker, fct] of Object.entries(factor.tickers)) {
        const hasDepth = depthTickers.has(ticker);
        const hasRank = fct.fct_rank !== null && fct.fct_rank !== undefined;
        if (!hasRank && !hasDepth) continue;

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
            val: valuations[ticker],
            overlay: overlay[ticker],
            delta: (pl != null && p != null) ? Math.round(pl - p) : null,
            promo: 'none',
            vetoed: !!(fct.fct_veto || (fct as any).fct_llm_veto),
            vetoReason: (fct.fct_veto_detail as string) || (fct.fct_veto as string) || null,
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
            val: valuations[ticker],
            overlay: overlay[ticker],
            delta: null,
            promo: 'promoted',
            vetoed: false,
            vetoReason: null,
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
    // names it called undervalued by how far the price sits below the median IV.
    rows
        .filter((r) => r.depth?.direction === 'undervalued')
        .sort((a, b) => (b.depth?.mos_vs_median_pct ?? -1e9) - (a.depth?.mos_vs_median_pct ?? -1e9))
        .forEach((r, i) => { r.aiRank = i + 1; });

    // Promotion is the AI disagreeing with the shortlist in either direction:
    // it valued a non-shortlisted name above its price, or it knocked a
    // shortlisted name out by valuing it below the price.
    for (const r of rows) {
        if (!r.depth) continue;
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
    watchlist: DeskRow[];     // price inside or above the band
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
            } else if (r.depth.direction === 'undervalued' && r.depth.actionable !== false) {
                // actionable === false (gated out post-verdict) is excluded from the
                // shortlist — it falls to watchlist below, alongside the other
                // depth-analyzed names that are not the AI's pick right now. Rows
                // without the actionable field (legacy overlays) keep today's
                // behaviour: actionable !== false is true for undefined too.
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

    return { researchNow, watchlist, awaiting, vetoed };
}

export type CompareSort = 'delta' | 'quant' | 'ai';

/** Compare lens: only names both engines have an opinion on, biggest split first. */
export function compareRows(rows: DeskRow[], sort: CompareSort): DeskRow[] {
    const out = rows.filter((r) => r.depth && r.depth.direction !== 'NOT_USABLE');
    // Size of the split: an explicit rank move where both engines ranked the name,
    // otherwise how deep into the quant shortlist the AI's rejection reaches.
    const deltaOf = (r: DeskRow) => {
        const d = rankDelta(r);
        if (d !== null) return Math.abs(d);
        if (r.promo === 'demoted' && r.fct.fct_rank) return Math.max(1, 100 - r.fct.fct_rank);
        return 0;
    };
    if (sort === 'quant') out.sort((a, b) => (a.fct.fct_rank ?? 1e9) - (b.fct.fct_rank ?? 1e9));
    else if (sort === 'ai') out.sort((a, b) => (a.aiRank ?? 1e9) - (b.aiRank ?? 1e9));
    else out.sort((a, b) => deltaOf(b) - deltaOf(a));
    return out;
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

/**
 * One-line reason the two engines disagree, assembled from what the data knows.
 * The reverse-DCF expectations gap used to open this line; that dataset is
 * retired, so the reason is now built from the band and the quant haircuts.
 */
export function whySplit(r: DeskRow): string {
    const d = r.depth?.direction;
    const bits: string[] = [];
    // The median gap is already its own column here, so it only earns a mention
    // when there is no band direction to state instead.
    const gapPct = r.depth?.mos_vs_median_pct;
    if (!d && gapPct != null) {
        bits.push(`median run values it ${Math.abs(gapPct).toFixed(1)}% ${gapPct >= 0 ? 'above' : 'below'} the price`);
    }
    if (d === 'undervalued') bits.push('all runs land above the price');
    else if (d === 'overvalued') bits.push('all runs land below the price');
    else if (d === 'hold') bits.push('the price sits inside the run spread');
    if (r.fct.fct_haircuts && (r.fct.fct_haircuts as any).forensic < 1) bits.push('forensic haircut applied');
    return bits.length ? bits.join(' · ') : 'no single driver — the engines weight the same evidence differently';
}
