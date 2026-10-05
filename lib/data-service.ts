import { type StockCandidate, type ReverseResult } from "./blueprint";

export function formatKoreanWon(n: number, decimals: number = 2) {
    if (Math.abs(n) >= 1e12) return `${(n / 1e12).toLocaleString('en-US', {maximumFractionDigits: decimals})}조원`;
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toLocaleString('en-US', {maximumFractionDigits: decimals})}억원`;
    if (Math.abs(n) >= 1e4) return `${(n / 1e4).toLocaleString('en-US', {maximumFractionDigits: decimals})}만원`;
    return `${n.toLocaleString('en-US', {maximumFractionDigits: decimals})}원`;
}

export function formatTaiwanNTD(n: number, decimals: number = 2) {
    if (Math.abs(n) >= 1e12) return `${(n / 1e12).toLocaleString('en-US', {maximumFractionDigits: decimals})}兆元`;
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toLocaleString('en-US', {maximumFractionDigits: decimals})}億元`;
    if (Math.abs(n) >= 1e4) return `${(n / 1e4).toLocaleString('en-US', {maximumFractionDigits: decimals})}萬元`;
    return `${n.toLocaleString('en-US', {maximumFractionDigits: decimals})}元`;
}

function parseFlexibleNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const cleaned = String(value).replace(/[%,$,x]/g, '').trim();
    if (!cleaned || cleaned.toLowerCase() === 'n/a' || cleaned.toLowerCase() === 'nan') return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberList(value: any): number[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(parseFlexibleNumber).filter((n): n is number => n !== null);

    const raw = String(value).trim();
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed
                .map((item) => typeof item === 'object'
                    ? parseFlexibleNumber(item.Close ?? item.close ?? item.Price ?? item.price ?? item.value)
                    : parseFlexibleNumber(item))
                .filter((n): n is number => n !== null);
        }
    } catch (e) {
        // Fall through to delimiter parsing.
    }

    return raw
        .split(/[|;\s]+/)
        .map(parseFlexibleNumber)
        .filter((n): n is number => n !== null);
}

function firstNumber(...values: any[]): number | null {
    for (const value of values) {
        const parsed = parseFlexibleNumber(value);
        if (parsed !== null) return parsed;
    }
    return null;
}

function parseCSV(text: string): any[] {
    const rows: any[] = [];
    let row: string[] = [];
    let currentVal = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentVal += '"';
                i++; // Skip the escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(currentVal.trim());
            currentVal = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            if (currentVal || row.length > 0) {
                row.push(currentVal.trim());
                rows.push(row);
            }
            row = [];
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    if (currentVal || row.length > 0) {
        row.push(currentVal.trim());
        rows.push(row);
    }
    
    if (rows.length < 2) return [];
    const headers = rows[0];
    
    return rows.slice(1).map(r => {
        const obj: Record<string, any> = {};
        for (let i = 0; i < headers.length; i++) {
            if (headers[i]) {
                obj[headers[i]] = r[i] || '';
            }
        }
        return obj;
    });
}

export type Market = 'US' | 'Korea' | 'Taiwan';

export async function fetchStocks(market: Market = 'US'): Promise<{ data: StockCandidate[], lastUpdated: string | null }> {
    try {
        const basePath = '';
        const filename = market === 'US' ? 'stocks.csv' : 'stocks_intl.csv';
        
        const response = await fetch(`${basePath}/data/${filename}?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${market} stock data`);
        }
        const text = await response.text();
        let rawData = parseCSV(text);

        // ROBUST MARKET FILTERING:
        // Ensure each tab ONLY shows its own data regardless of the source file.
        if (market === 'Korea') {
            rawData = rawData.filter(r => {
                const s = r['Symbol'] || '';
                return s.endsWith('.KS') || s.endsWith('.KQ');
            });
        } else if (market === 'Taiwan') {
            rawData = rawData.filter(r => {
                const s = r['Symbol'] || '';
                return s.endsWith('.TW') || s.endsWith('.TWO');
            });
        } else if (market === 'US') {
            // US tab should filter OUT international suffixes to be safe
            rawData = rawData.filter(r => {
                const s = r['Symbol'] || '';
                return !s.endsWith('.KS') && !s.endsWith('.KQ') && !s.endsWith('.TW') && !s.endsWith('.TWO');
            });
        }
        
        const lastMod = response.headers.get('Last-Modified');
        let lastUpdated = null;
        if (lastMod) {
            const d = new Date(lastMod);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            lastUpdated = `${yyyy}-${mm}-${dd}`;
        }

        const mappedData = rawData.map(row => {
            // Percent values in CSV are decimals (e.g. 0.25 for 25%).
            // Use 100 as multiplier for dashboard cards which expect integers.
            const multiplier = 100;

            const base = {
                symbol: row['Symbol'] || '',
                name: (row['Name'] || '').replace(/"/g, ''),
                description: (row['Description'] || '').replace(/"/g, ''),
                sector: row['Sector'] || 'Unknown',
                industry: row['Industry'] || 'Unknown',
                price: parseFlexibleNumber(row['Price']) || 0,
                marketCap: parseFlexibleNumber(row['Market Cap']) || 0,
                lastUpdated: row['Last_Updated'] || undefined,

                // Metrics (Convert decimals to % points)
                revenueGrowth: (parseFlexibleNumber(row['Rev Growth']) || 0) * multiplier,
                grossMargin: (parseFlexibleNumber(row['Gross Margin']) || 0) * multiplier,
                roic: (parseFlexibleNumber(row['ROIC']) || 0) * multiplier,
                insiderOwnership: (parseFlexibleNumber(row['Insider Own']) || 0) * multiplier,
                
                pegRatio: parseFlexibleNumber(row['PEG']) || 0,
                zScore: parseFlexibleNumber(row['Z-Score']),
                peRatio: firstNumber(row['P/E'], row['PE'], row['Trailing P/E'], row['Current P/E']) || 0,
                priceToSales: parseFlexibleNumber(row['P/S']) || 0,
                floatShares: parseFlexibleNumber(row['Float']) || 0,
                ocf: parseFlexibleNumber(row['OCF']) || 0,
                capex: parseFlexibleNumber(row['CAPEX']) || 0,

                // Optional fields used by the YouTube multi-strategy filter.
                epsTtm: firstNumber(row['EPS TTM'], row['EPS_TTM'], row['Trailing EPS'], row['EPS']),
                previousEpsTtm: firstNumber(row['Previous EPS TTM'], row['Previous_EPS_TTM'], row['Prior EPS TTM']),
                forwardEpsEstimate: firstNumber(row['Forward EPS'], row['Forward_EPS'], row['Forward EPS Estimate'], row['Next Year EPS']),
                priceToBook: firstNumber(row['P/B'], row['PB'], row['Price/Book'], row['Price to Book']),
                fiveYearAveragePe: firstNumber(row['5Y Avg P/E'], row['5Y Average P/E'], row['PE 5Y Avg'], row['P/E 5Y Avg']),
                monthlyMa20: firstNumber(row['20M MA'], row['20 Month MA'], row['20-Month MA'], row['Monthly MA 20']),
                monthlyCloses: parseNumberList(row['Monthly Closes'] || row['Monthly_Closes'] || row['Monthly Prices'] || row['Monthly_Prices']),
                quarterlyEps: parseNumberList(row['Quarterly EPS'] || row['Quarterly_EPS']),
                consecutiveGrowth: parseFlexibleNumber(row['Consecutive Growth'] || row['Consecutive_Growth']) || 0,
                epsYoyGrowth: parseFlexibleNumber(row['EPS YoY Growth'] || row['EPS_YoY_Growth']),
                revenueYoyGrowth: parseFlexibleNumber(row['Revenue YoY Growth'] || row['Revenue_YoY_Growth']),

                // Adapter Metadata
                _status: row['Status'],
                _score: parseFlexibleNumber(row['Score']) || 0,
                _failCodes: (row['Fail Codes'] || '').split(',').filter((c: string) => c),
                _financialData: null,
                _reasons: []
            };
            return base;
        }) as any[];
        
        return { data: mappedData, lastUpdated };
    } catch (error) {
        console.error("Error loading stocks:", error);
        return { data: [], lastUpdated: null };
    }
}

// Phase 9: Load reverse screening engine results from stocks.json
export async function fetchReverseScores(): Promise<Record<string, ReverseResult>> {
    try {
        const scoreResponse = await fetch(`/data/reverse_scores.json?t=${new Date().getTime()}`);
        if (scoreResponse.ok) {
            return await scoreResponse.json();
        }

        const response = await fetch(`/data/stocks.json?t=${new Date().getTime()}`);
        if (!response.ok) return {};
        const stocks: any[] = await response.json();
        const result: Record<string, ReverseResult> = {};
        for (const stock of stocks) {
            if (stock.reverse && stock.symbol) {
                result[stock.symbol] = stock.reverse;
            }
        }
        return result;
    } catch (error) {
        console.error("Error loading reverse scores:", error);
        return {};
    }
}

// ── Factor Lab + Decision Cockpit sidecars ─────────────────────────────────

export interface FactorEntry {
    fct_composite: number | null;
    fct_percentile: number | null;
    fct_band: string | null;
    fct_rank: number | null;
    fct_veto: string | null;
    fct_veto_detail?: string | null;  // why, for vetoes that carry a reason (not_tradable)
    fct_z: Record<string, number | null> | null;
    fct_vol?: number | null;
    fct_contributions: Record<string, number> | null;
    fct_haircuts: Record<string, number> | null;
    fct_flags?: string[] | null;
    fct_flag_detail?: Record<string, any> | null;
    fct_nominated_doors?: string[] | null;
    /** Price-trend facts the screen read; `mom_6m` and `pct_from_52w_high` are fractions (0.90 = +90%). */
    fct_momentum_state?: {
        mom_6m?: number | null;
        pct_from_52w_high?: number | null;
        above_200dma?: boolean | null;
        regime_shift_down?: boolean | null;
        price_asof?: string | null;
    } | null;
    door1_pillars_used?: string[] | null;
    door2_pillars_used?: string[] | null;
    discount_rate_pct?: number | null;
    mid_cycle_window_years?: number | null;
    // Stage-5 RS2 LLM overlay (written by score_factors.apply_llm_overlay; absent until verdicts exist)
    fct_band_llm?: string | null;     // LLM-overlay parallel band (additive; quant band stays in fct_band)
    fct_llm?: string | null;          // 'promoted' | 'demoted' | 'none'
    fct_llm_veto?: string | null;     // 'llm_reject' when the LLM action is AVOID/SELL
    fct_percentile_llm?: number | null;
    fct_llm_verdict?: {
        stance: string | null;
        action: string | null;
        conviction: number | null;
        method?: string | null;
        mos_pct?: number | null;
        gap?: number | null;
        recommended_weight_pct?: number | null;
        analyzed_date?: string | null;
        exit_review?: boolean | null;  // holder's exit review — name left the quant list
    } | null;
}

export interface BandTransitions {
    entered_rn: string[];
    left_rn: string[];
    entered_book: string[];
    left_book: string[];
    retained_by_hysteresis: string[];
}

export interface FactorScoresPayload {
    generated_at: string;
    engine: string;
    band_transitions?: BandTransitions | null;
    sector_quota_source?: string | null;
    discount_rate_source?: string | null;
    discount_rate_reason?: string | null;
    discount_rate_asof?: string | null;
    door2_momentum_floor?: number | null;
    scored_count: number;
    band_counts: Record<string, number>;
    veto_counts: Record<string, number>;
    tickers: Record<string, FactorEntry>;
}

export interface ValuationModel {
    implied_growth: number | null;
    implied_growth_clamped?: boolean;
    hist_revenue_cagr_5y?: number | null;
    hist_fcf_cagr_5y?: number | null;
    trajectory_slope?: number | null;
    expectations_gap_pts?: number | null;
    verdict?: string;
    reason?: string;
    assumptions?: {
        base_cf: number;
        base_cf_kind: string;
        fiscal_year: number;
        wacc: number;
        terminal_growth: number;
        stage1_years: number;
        fade_years: number;
        market_cap: number;
    };
}

async function fetchJson<T>(path: string): Promise<T | null> {
    try {
        const response = await fetch(`${path}?t=${new Date().getTime()}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error(`Error loading ${path}:`, error);
        return null;
    }
}

// ── Institutional Underwriting Contract ──────────────────────────────────────
export interface ReentryTranches {
    tranche_1_starter?: number | null;
    tranche_2_core?: number | null;
}

export interface InstitutionalScorecard {
    median_iv: number | null;
    median_bull_iv?: number | null;
    median_bear_iv?: number | null;
    iv_band_low?: number | null;
    iv_band_high?: number | null;
    median_conviction_score?: number | null;
    median_quality_moat?: number | null;
    median_kelly_fraction_pct?: number | null;
    asymmetric_payoff_skew?: number | null;
    reentry_tranches?: ReentryTranches | null;
    thesis_invalidation_triggers?: string[];
}

export interface SampleScorecard {
    base_iv?: number | null;
    bull_iv?: number | null;
    bear_iv?: number | null;
    conviction_score?: number | null;
    business_quality_moat?: number | null;
    kelly_fraction_pct?: number | null;
    asymmetric_payoff_skew?: number | null;
    reentry_tranches?: ReentryTranches | null;
    thesis_invalidation_trigger?: string | null;
}

// ── Depth-tier band-direction verdicts (replacement pipeline, RS2 Local) ────
// Written by orchestrate_depth.py at sweep end. band_direction_v1: direction is where the
// price sits vs the IV band across independent model runs; spread maps to a size hint.
export interface DepthVerdict {
    ticker: string;
    price: number | null;
    date: string | null;
    model: string | null;
    n_basis: number;
    iv_band_low: number | null;
    iv_band_high: number | null;
    median_iv: number | null;
    spread_pct: number | null;
    direction: "overvalued" | "undervalued" | "hold" | "NOT_USABLE" | null;
    size_hint: "full" | "half" | "quarter" | null;
    mos_vs_median_pct?: number | null;
    reason?: string | null;
    // Gate-on-read overlay fields (P1.3). Absent means a legacy row: treat as
    // actionable (fail-open) and, if direction is the legacy 'NOT_USABLE' string
    // rather than null, still not-usable.
    actionable?: boolean | null;
    actionable_reasons?: string[] | null;
    status?: string | null;
    verdict_price?: number | null;    // price the analyst saw when it made the verdict (price itself is live)
    gate_version?: number | null;
    pack_revision?: number | null;
    flags?: string[] | null;
    // Present in the shipped payload (band_direction_v1) but previously untyped.
    samples_run?: number | null;      // runs attempted; n_basis = runs that passed the guards
    scheme?: string | null;
    consensus_dir?: string | null;    // run id, e.g. LULU_20260821_155157 — shown on the transcripts header
    backfilled?: boolean;

    // Institutional Underwriting Contract
    scorecard?: InstitutionalScorecard | null;
    conviction_score?: number | null;       // 1-15 conviction scale
    business_quality_moat?: number | null;  // 1-5 economic moat scale
    kelly_fraction_pct?: number | null;     // half-Kelly sizing fraction (e.g. 5.0%)
    asymmetric_payoff_skew?: number | null; // bull payoff vs bear downside ratio
    bull_iv?: number | null;                // median bull intrinsic value
    bear_iv?: number | null;                // median bear intrinsic value
    reentry_tranches?: ReentryTranches | null;
    thesis_invalidation_triggers?: string[];
    converged?: boolean | null;
    early_stop?: boolean | null;
    mode?: string | null;
    runs?: Array<{
        sample: number;
        iv: number | null;
        bull_iv?: number | null;
        bear_iv?: number | null;
        conviction?: number | null;
        moat?: number | null;
        kelly?: number | null;
        secs?: number | null;
        plausible?: boolean;
        trigger?: string;
        reasons?: string[] | null;
    }>;
}

export interface DepthOverlayPayload {
    generated_at: string;
    scheme: string;
    count: number;
    actionable_count?: number;
    gate_version?: number | null;
    tickers: Record<string, DepthVerdict>;
}

export interface DepthSample {
    sample: number;
    iv: number | null;
    plausible: boolean;
    reasons: string[];
    truncated: boolean;
    secs: number | null;
    report: string;
    scorecard?: SampleScorecard | null;
}

export interface DepthReportBundle {
    ticker: string;
    run: string;
    verdict: DepthVerdict;
    samples: DepthSample[];
    scorecard?: InstitutionalScorecard | null;
}

export async function fetchDepthReport(ticker: string): Promise<DepthReportBundle | null> {
    return fetchJson<DepthReportBundle>(`/data/depth_reports/${encodeURIComponent(ticker.toUpperCase())}.json`);
}

export async function fetchDepthOverlay(): Promise<DepthOverlayPayload | null> {
    return fetchJson<DepthOverlayPayload>('/data/depth_overlay.json');
}

export async function fetchLegacyDepthReport(ticker: string): Promise<DepthReportBundle | null> {
    return fetchJson<DepthReportBundle>(`/data/depth_reports_legacy/${encodeURIComponent(ticker.toUpperCase())}.json`);
}

export async function fetchLegacyDepthOverlay(): Promise<DepthOverlayPayload | null> {
    return fetchJson<DepthOverlayPayload>('/data/depth_overlay_legacy.json');
}

// ── On-demand (operator-requested) analyses ─────────────────────────────────
// Written by RS2 Local's on-demand path (depth_ondemand.py / orchestrate_depth
// build_ondemand_bundles) to DEDICATED files: these verdicts are one-shots and are
// deliberately invisible to the overlay, rankings and the paper portfolios. Bundles
// share the depth_reports schema, so DepthReportBundle is reused verbatim.
export interface OndemandRequestRow {
    ticker: string;
    date: string | null;
    direction: DepthVerdict['direction'];
    iv_band_low: number | null;
    iv_band_high: number | null;
    price: number | null;
    size_hint: DepthVerdict['size_hint'];
    spread_pct: number | null;
    consensus_dir: string | null;
}

export interface OndemandIndexPayload {
    generated_at: string;
    count: number;
    requests: OndemandRequestRow[];   // every on-demand verdict, newest first
}

export async function fetchOndemandIndex(): Promise<OndemandIndexPayload | null> {
    return fetchJson<OndemandIndexPayload>('/data/ondemand_index.json');
}

export async function fetchOndemandReport(ticker: string): Promise<DepthReportBundle | null> {
    return fetchJson<DepthReportBundle>(`/data/ondemand_reports/${encodeURIComponent(ticker.toUpperCase())}.json`);
}

// The INBOUND request queue (Supabase ondemand_queue, served by /api/ondemand) —
// distinct from OndemandRequestRow above, which is a PUBLISHED verdict. A row here
// is a request waiting for / handled by the operator's PC; its verdict later
// appears as an OndemandRequestRow in the published index.
export interface OndemandQueueRow {
    id: number;
    ticker: string;
    status: 'pending' | 'claimed' | 'handled' | 'failed';
    message: string | null;
    requested_at: string;
    handled_at: string | null;
}

export async function fetchFactorScores(): Promise<FactorScoresPayload | null> {
    return fetchJson<FactorScoresPayload>('/data/factor_scores.json');
}

// ── Pipeline / macro status files (shell freshness strip and health drawer) ──
export interface ChainInvariant {
    name: string;
    level: string;
    ok: boolean;
    detail: string;
}

export interface ChainManifest {
    ok?: boolean;
    finished_at?: string | null;
    run_id?: string | null;
    invariants?: ChainInvariant[] | null;
}

export interface MriRegime {
    reported_regime?: string | null;
    reported_regime_probability?: number | null;
    confidence?: number | null;
    date?: string | null;
    built_at?: string | null;
    data_health_warnings?: string[] | null;
}

export interface MriCostOfCapital {
    implied_cost_of_equity?: number | null;
    degraded?: boolean | null;
    asof?: string | null;
}

export async function fetchChainManifest(): Promise<ChainManifest | null> {
    return fetchJson<ChainManifest>('/data/chain_manifest.json');
}

export async function fetchMriRegime(): Promise<MriRegime | null> {
    return fetchJson<MriRegime>('/data/mri/current_regime.json');
}

export async function fetchMriCostOfCapital(): Promise<MriCostOfCapital | null> {
    return fetchJson<MriCostOfCapital>('/data/mri/cost_of_capital_anchor.json');
}

export async function fetchValuationModels(): Promise<{ generated_at: string; disclaimer: string; tickers: Record<string, ValuationModel> } | null> {
    return fetchJson('/data/valuation_models.json');
}

// ── RS2 local-LLM research + outcomes (public/data/rs2/, published by the local orchestrator) ──
export interface Rs2RunMeta {
    ts: string;
    date: string | null;
    action: string | null;
    conviction: number | null;
    stance: string | null;
    method: string | null;
    expectations_gap_pts: number | null;
    mos_pct: number | null;
    fair_value: number | null;
    recommended_weight_pct: number | null;
    band_at_analysis: string | null;
    report: string | null;
}
export interface Rs2IndexPayload {
    generated_at: string;
    k_full_per_ticker: number;
    count: number;
    tickers: Record<string, { latest: Rs2RunMeta; history: Rs2RunMeta[] }>;
}
export interface Rs2Bundle {
    ticker: string;
    ts: string;
    date: string | null;
    verdict: Record<string, any>;
    final_md: string | null;
    research_md: string | null;
    research_generated: string | null;
    raw: Record<string, string>;
}

// Index of ALL runs (metadata only) — null/absent until the local engine publishes. No-op safe.
export async function fetchRs2Index(): Promise<Rs2IndexPayload | null> {
    return fetchJson<Rs2IndexPayload>('/data/rs2/index.json');
}
// One run's full text (verdict + final analysis + research brief + raw stages). Only the newest K per
// ticker exist as full bundles; older runs are metadata-only in the index (fetch returns null).
export async function fetchRs2Report(ticker: string, ts: string): Promise<Rs2Bundle | null> {
    return fetchJson<Rs2Bundle>(`/data/rs2/${encodeURIComponent(ticker.toUpperCase())}/${ts}.json`);
}

export async function fetchOverlaySignals(): Promise<any | null> {
    return fetchJson('/data/overlay_signals.json');
}

// Graded verdict outcomes (written by the depth-outcomes job). Null until the file exists.
export async function fetchDepthOutcomes(): Promise<any | null> {
    return fetchJson('/data/depth_outcomes.json');
}

export async function fetchPaperLedgers(): Promise<any | null> {
    // Runtime read from Supabase (written by track_paper_portfolios.py) so a
    // portfolio-snapshot refresh never needs a commit/redeploy. Falls back to the
    // committed static file if the API/Supabase is unavailable.
    try {
        const res = await fetch(`/api/paper-ledgers?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
            const j = await res.json();
            if (j) return j;
        }
    } catch { /* fall through to static backup */ }
    return fetchJson('/data/paper_ledgers.json');
}
