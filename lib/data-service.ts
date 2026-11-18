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

/**
 * The price of record: stocks.json, the file the engine scores and the post-close refresh updates (stocks.csv is written by
 * the daily fetch only, so its prices can be a session behind). `asof` is the session the refresh priced
 * (`_meta.price_asof` on the first row); a row carries `price_older_than_asof` (its last bar date) when it could not be
 * priced for that session. Both fields are absent from files written before 2026-11-12.
 */
export interface EnginePrices {
    asof: string | null;
    /** When the refresh ran (`_meta.price_refresh_at`). */
    refreshedAt: string | null;
    rows: Record<string, { price: number; olderThan: string | null }>;
}

export async function fetchEnginePrices(): Promise<EnginePrices | null> {
    // prices.json is written by the post-close refresh in the same run as stocks.json (same prices, same session stamp).
    // It is the small file for the browser: stocks.json itself is about 28 MB.
    const f = await fetchJson<{ asof?: string | null; refreshed_at?: string | null; prices?: Record<string, [number, string | null]> }>('/data/prices.json');
    if (!f || typeof f !== 'object' || !f.prices) return null;
    const rows: EnginePrices['rows'] = {};
    for (const [symbol, v] of Object.entries(f.prices)) {
        if (Array.isArray(v) && typeof v[0] === 'number' && Number.isFinite(v[0]) && v[0] > 0) {
            rows[symbol] = { price: v[0], olderThan: v[1] ?? null };
        }
    }
    return { asof: f.asof ?? null, refreshedAt: f.refreshed_at ?? null, rows };
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

// ── Qwen analysis (operator 2026-11-06: per-stock AI analysis back on the site) ─────────────────
// Written by rs2-local tools/site/qwen_site.py and published from screener-publish: Qwen (the local model) reads each company's
// filings; values come from code using Qwen's choices where both of its runs agree. Paper only.

export interface QwenClaim { claim: string | null; support: string | null; facts: string[] | null; quotes: string[] | null; basis: string | null }

export interface QwenReport {
    ticker: string;
    date: string;
    source: string;
    analysis: string;
    claims: number | null;
    claims_supported: number | null;
    in_code_book: boolean;
    qwen_book: string | null;
    flags: string[];
    valued: boolean;
    no_value_reason: string | null;
    family: string | null;
    value_base?: number; value_bear?: number; value_bull?: number;
    price_at_publish?: number; upside?: number; far_from_price?: boolean; seeds_agree?: boolean; share_unit_note?: string | null;
    tasks: Record<string, QwenClaim[]>;
    valuation: { annotations?: string[]; unknowns?: string[] | null; departures?: { input: string; driver: string; evidence: string[] }[];
                 evidence?: Record<string, { text: string; kind: string; period: string | null }> } | null;
    authority: string;
    /** The decided valuation (rs2-local tools/site/decided_value.py): present only for a name valued by it; then `valuation` is null. */
    decided?: DecidedValuation | null;
    /** A statutory tax-rate fallback: the value at a second rate. `value_alt` is per quoted share. */
    tax_range?: { label?: string; rate?: number | null; rate_alt?: number | null; value_alt?: { bear?: number; base?: number; bull?: number } | null; status_alt?: string | null } | null;
    /** Why a thin profit record is thin (rs2-local tools/site/why_losses.py); `label` is null when it could not be explained. */
    loss_record?: { cause?: string | null; label?: string | null; explanation?: string | null; quotes?: DecidedQuote[] } | null;
}

export interface DecidedQuote { id: string; quote: string }
/** A key of `inputs` this page knows (operating, financial). Any other key is shown too, under its humanised name. */
export type DecidedInputKey = 'rev_growth' | 'op_margin' | 'long_run_op_margin' | 'roe' | 'book_growth' | 'long_run_roe' | 'terminal_growth' | 'fade_years'
    | 'return_on_new_investment_long_run' | 'capex_to_revenue';

/** A yes/no/unclear answer with the AI's sentence (situation.tax_rate_representative, debt_level_representative). */
export interface DecidedAnswer { answer?: string | null; why?: string | null }

/** A checked amount the AI read from the filings (decided_value._checked_item): `amount` in the filing's currency units. */
export interface DecidedAmount { printed?: number; scale?: string; amount?: number | null; what?: string | null; quotes?: DecidedQuote[]; sign?: string | null }

/** One run of the decided method: the inputs the AI set, why, and what code made of them. Values are per filed share. */
export interface DecidedRun {
    /** Operating: cyclical, margin_position, tax_rate_representative, debt_level_representative; financial: institution, roe_position, capital_constrained; real estate: property_business. */
    situation?: { cyclical?: string | null; margin_position?: string | null; base_year_representative?: string | null; why?: string | null;
                  institution?: string | null; roe_position?: string | null; capital_constrained?: string | null; property_business?: string | null;
                  tax_rate_representative?: DecidedAnswer | null; debt_level_representative?: DecidedAnswer | null; [key: string]: unknown };
    inputs?: Record<string, unknown>;
    ranges?: Record<string, unknown>;
    risks?: { risk?: string; input_hit?: string; bear_value?: number | number[] | null }[];
    confidence?: string | null;
    reasons?: Record<string, { why?: string | null; quotes?: DecidedQuote[]; quotes_given?: number } | undefined>;
    flags?: string[];
    values?: { bear?: number; base?: number; bull?: number };
    /** Operating v2: what the AI took out of the base year (decided_value.adjust_base). */
    adjustments?: { cash_not_free?: DecidedAmount | null; base_year_one_offs?: DecidedAmount[] | null } | null;
    /** Real estate (decided_real_estate.ffo_check): the company's reported FFO against code's derivation. */
    real_estate?: { property_business?: string | null; ffo?: {
        status?: string; reported?: { value?: number; per?: string; what?: string | null; quotes?: DecidedQuote[] } | null;
        derived_after_preferred?: number | null; per_share_divisor?: number | null; gap_after_preferred?: number | null } | null } | null;
}

export interface DecidedValuation {
    version?: string;
    method?: string;
    runs: Record<string, DecidedRun>;
    run_gap?: number | null;
    situation_unclear?: boolean;
    flags?: string[];
    value_at_old_defaults?: number | null;
    value_at_old_defaults_quoted?: number | null;
    old_defaults_inputs?: unknown;
}

/** A report's file name for a ticker. A ticker that is a Windows device name cannot be committed from the machine that
 *  publishes these files, so its report is published with a trailing underscore (rs2-local tools/site site_stem). */
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/;
export function reportStem(ticker: string): string {
    const t = ticker.toUpperCase();
    return WINDOWS_RESERVED.test(t) ? `${t}_` : t;
}

export async function fetchQwenReport(ticker: string): Promise<QwenReport | null> {
    return fetchJson<QwenReport>(`/data/qwen_reports/${encodeURIComponent(reportStem(ticker))}.json`);
}

/** One name's row in qwen_overlay.json: the report without its claims and valuation detail. */
export type QwenOverlayRow = Omit<QwenReport, 'ticker' | 'tasks' | 'valuation' | 'authority'>;

export interface QwenOverlayPayload {
    schema: string;
    generated_at: string;
    count: number;
    valued_count: number;
    tickers: Record<string, QwenOverlayRow>;
}

export async function fetchQwenOverlay(): Promise<QwenOverlayPayload | null> {
    return fetchJson<QwenOverlayPayload>('/data/qwen_overlay.json');
}

// ── Gemini analysis (Gemini doing the Qwen job, name by name; files may be absent at first) ─────────
// gemini_c_overlay.json rows and gemini_c_reports/<TICKER>.json have the Qwen shapes plus a verdict and its reason.

/** `model` says which arm read the filings (a Gemini or a Claude Opus model id). */
export interface GeminiCReport extends QwenReport { verdict: OpusVerdictCode; verdict_reason: string; model?: string }

export async function fetchGeminiCReport(ticker: string): Promise<GeminiCReport | null> {
    return fetchJson<GeminiCReport>(`/data/gemini_c_reports/${encodeURIComponent(reportStem(ticker))}.json`);
}

export type GeminiCRow = QwenOverlayRow & { verdict: OpusVerdictCode; verdict_reason: string; model?: string };

export interface GeminiCOverlayPayload {
    schema: string;
    generated_at: string;
    model: string;
    effort: string;
    count: number;
    valued_count: number;
    verdict_counts: Record<OpusVerdictCode, number>;
    verdict_rule: string;
    note: string;
    tickers: Record<string, GeminiCRow>;
}

export async function fetchGeminiCOverlay(): Promise<GeminiCOverlayPayload | null> {
    return fetchJson<GeminiCOverlayPayload>('/data/gemini_c_overlay.json');
}

/**
 * The monthly books of record (m3o_books.json, written with the Qwen files): ticker -> weight per book. A name in `code_book`
 * but not in `qwen_book` is a slot Qwen's filing check turned into cash.
 */
export interface MonthlyBooksPayload {
    schema?: string;
    formation?: string;
    generated_at?: string;
    slots?: number;
    books?: { code_book?: Record<string, number>; qwen_book?: Record<string, number> };
}

export async function fetchMonthlyBooks(): Promise<MonthlyBooksPayload | null> {
    return fetchJson<MonthlyBooksPayload>('/data/m3o_books.json');
}

// ── Opus valuation verdicts (stocks-workspace/baselines/opus/SPEC.md v1, section 3d) ─────────────
// Paper-only: written by stocks-workspace/baselines/opus/build_opus_overlay.py, shown on the stock page and graded by
// the separate rn_opus paper book. The model supplies inputs; code does the arithmetic. Never part of depth.

export type OpusVerdictCode = 'BUY' | 'WATCH' | 'AVOID' | 'NO_CALL';

export interface OpusVerdict {
    ticker: string;
    run_source: 'opus_v1';
    not_for_real_money: true;
    verdict: OpusVerdictCode;
    /** BUY -> undervalued, WATCH -> hold, AVOID -> overvalued, NO_CALL -> null. */
    direction: 'undervalued' | 'hold' | 'overvalued' | null;
    no_call_reason: string | null;
    price: number | null;
    price_date: string | null;
    currency: string | null;
    /** Per listed share, price currency, across the three runs. */
    value: { median: number | null; low: number | null; high: number | null };
    value_to_price: number | null;
    spread_pct: number | null;
    alpha_pts: number | null;
    ke: number | null;
    method: string | null;
    runs: number;
    run_verdicts: string[];
    /** From the median run. */
    scenarios: { name: string; probability: number | null; value: number | null }[];
    market_view: string | null;
    checks: Record<string, unknown>;
    data_flags: string[];
    captured_at: string | null;
    /** The reviewing analyst's read (spec v1.2): it judges whether the analysis is fair and sound and gives the verdict,
     *  which may be above or below `code_verdict`, the verdict the simple rule gave from the code's value. */
    review?: {
        checked_on: string; code_verdict: string; verdict: string;
        change: 'raised' | 'lowered' | 'same' | 'to_no_call' | 'from_no_call';
        soundness: string; value_view: string; fair_value_range: [number, number] | null;
        reasons: string[]; one_line: string;
        events: { fact: string | null; date: string | null; source_url: string | null }[];
    } | null;
    /** The analysts' consensus target (fetch_analyst_targets.py), shown beside Claude's view only; never shown to the
     *  analyst or the reviewer. Absent or null when the name has none. */
    analyst?: {
        target_mean: number; target_median: number | null; target_low: number | null; target_high: number | null;
        analysts: number | null; rating: string | null; currency: string | null;
    } | null;
    /** Spec v1.3: the required return from the company's own share-price record (beta on SPY, blended 2/3 with the
     *  sector loading), with the value at one point either side and at the old sector rate. Absent in older files. */
    rate?: {
        beta_own: number | null; weeks: number | null; beta_prior: number | null; beta_used: number | null;
        source: 'own_blended' | 'sector_only' | null;
        ke_low: number | null; ke_mid: number | null; ke_high: number | null; ke_sector: number | null;
    } | null;
    sensitivity?: {
        value_at_ke_low: number | null; value_at_ke_high: number | null; value_at_ke_sector: number | null;
        verdict_at_ke_low: OpusVerdictCode; verdict_at_ke_high: OpusVerdictCode; holds_across_band: boolean;
    } | null;
}

export interface OpusOverlayPayload {
    scheme: 'opus_v1';
    run_source: 'opus_v1';
    not_for_real_money: true;
    generated_at: string;
    spec_version: string;
    model: string;
    count: number;
    verdict_counts: Record<OpusVerdictCode, number>;
    /** Where and when the analysts' targets were read; absent in files written before they were added. */
    analyst_source?: string;
    analyst_as_of?: string;
    tickers: Record<string, OpusVerdict>;
}

export async function fetchOpusOverlay(): Promise<OpusOverlayPayload | null> {
    return fetchJson<OpusOverlayPayload>('/data/opus_overlay.json');
}

// ── Analysts' targets (analyst_targets.json; the yardstick beside our value) ───────────────────────
// Written by the data pipeline; the file may be absent. A missing or malformed file is an empty map, never an error.

export interface AnalystTargetRow { mean?: number | null; median?: number | null; high?: number | null; low?: number | null; fetched_at?: string | null }

export interface AnalystTargetsPayload {
    schema?: string;
    generated_at?: string;
    source?: string;
    tickers: Record<string, AnalystTargetRow>;
}

export async function fetchAnalystTargets(): Promise<AnalystTargetsPayload> {
    const p = await fetchJson<AnalystTargetsPayload>('/data/analyst_targets.json');
    return p && p.tickers && typeof p.tickers === 'object' ? p : { tickers: {} };
}

// ── MRI news candidates (MRI-15, Stage 1; operator decisions D1/D5 of 2026-10-22) ───────────────
// A display index built by scripts/build_macro_events.py from MRI's event register. A candidate is a news report,
// not a confirmed event; its market block says what the market did after it, not whether the news caused it.
// Nothing here may change a score, rank or verdict.

export interface MacroEventMarket { theme_id: string; result: string; reason: string | null; provisional: boolean }
export interface MacroEventCompany { ticker: string; benchmark: string | null; result: string; z: number | null; reason: string | null }

export interface MacroEventCandidate {
    candidate_id: string;
    title: string | null;
    onset: string | null;
    first_available_at: string | null;
    status: 'open' | 'closed' | null;
    publisher_count: number | null;
    corroboration: string | null;
    classified: boolean;
    themes: { theme_id: string; direction: string }[];
    market: MacroEventMarket[];
    company: MacroEventCompany[];
    sectors: string[];
    flags: string[];
    named_tickers: string[];
}

export interface MacroEventsPayload {
    schema_version: 1;
    register_as_of_date: string | null;
    register_run_status: string | null;
    notice: string | null;
    market_meaning: string | null;
    candidates: MacroEventCandidate[];
    named: Record<string, number[]>;
    peer: Record<string, number[]>;
    cluster_of: Record<string, string>;
    sector: Record<string, number[]>;
}

export async function fetchMacroEvents(): Promise<MacroEventsPayload | null> {
    const p = await fetchJson<MacroEventsPayload>('/data/mri/macro_events.json');
    return p && p.schema_version === 1 ? p : null;   // refuse a version this page does not know
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
    regime_probabilities?: Record<string, number | null> | null;
    explanation?: string[] | null;
    active_shocks_on_date?: string[] | null;
    disclaimer?: string | null;
    /** The label before the transition filter; differs from reported_regime when the filter held the old one. */
    raw_dominant_regime?: string | null;
    /** One entry per dimension scored on the date (the level). */
    factors?: Record<string, MriDimensionFactor> | null;
    /** Direction beside level (engine commit 9b25a1d, 2026-11-19). Absent from a copy built before it. */
    dimension_direction?: Record<string, MriDimensionDirection> | null;
}

export interface MriDimensionFactor {
    score?: number | null;
    valid?: boolean | null;
    coverage?: number | null;
    reason?: string | null;
}

/** Change of a dimension's score over 3 and 6 months (d3, d6) and the same changes in units of their own spread (z3, z6). A null names its reason in `reasons`. */
export interface MriDimensionDirection {
    d3?: number | null;
    d6?: number | null;
    z3?: number | null;
    z6?: number | null;
    as_of?: string | null;
    reasons?: Record<string, string> | null;
}

export interface MriCostOfCapital {
    implied_cost_of_equity?: number | null;
    degraded?: boolean | null;
    asof?: string | null;
    built_at?: string | null;
    implied_erp?: number | null;
    erp_percentile_vs_history?: number | null;
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

// ── The rest of the MRI panels on /macro (WO_MP1). Every field is optional: the page shows "not available" for a gap. ──
export interface MriDailySummary {
    run_date?: string | null;
    run_id?: string | null;
    status?: string | null;
    warnings?: string[] | null;
    errors?: string[] | null;
    non_fatal_failures?: string[] | null;
    macro?: { date?: string | null; confidence?: number | null; reported_regime?: string | null; raw_dominant_regime?: string | null } | null;
    feature_freshness?: { gap_days?: number | null; max_feature_date?: string | null; stale?: boolean | null } | null;
    step_statuses?: Record<string, string> | null;
}

export interface MriTimelinePoint {
    date?: string | null;
    reported_regime?: string | null;
    raw_dominant_regime?: string | null;
    confidence?: number | null;
    valid?: boolean | null;
    probabilities?: Record<string, number> | null;
}

export interface MriRegimeTimeline {
    start_date?: string | null;
    end_date?: string | null;
    points?: MriTimelinePoint[] | null;
}

export interface MriFeatureSeries {
    feature_id?: string | null;
    series_id?: string | null;
    points?: { date?: string | null; value?: number | null }[] | null;
}

export interface MriMacroFeatures {
    end_date?: string | null;
    dimensions?: { dimension_id?: string | null; features?: MriFeatureSeries[] | null }[] | null;
}

export interface MriSectorComponent {
    component_id?: string | null;
    component_type?: string | null;
    contribution?: number | null;
}

export interface MriSectorRow {
    rank?: number | null;
    sector_id?: string | null;
    label?: string | null;
    proxy_ticker?: string | null;
    raw_sector_score?: number | null;
    confidence_adjusted_score?: number | null;
    top_supporting_components?: MriSectorComponent[] | null;
    top_opposing_components?: MriSectorComponent[] | null;
}

export interface MriSectorRanking {
    date?: string | null;
    macro_confidence?: number | null;
    sector_ranking?: MriSectorRow[] | null;
}

export interface MriValidationRow {
    cross_section?: string | null;
    horizon?: string | null;
    observation_count?: number | null;
    rank_ic_spearman?: number | null;
    top_minus_bottom_spread?: number | null;
    hit_rate_top_positive?: number | null;
}

export interface MriSectorValidation {
    valid?: boolean | null;
    reason?: string | null;
    score_start_date?: string | null;
    score_end_date?: string | null;
    summary?: MriValidationRow[] | null;
}

/** The shadow risk dial (risk_state.json, whose date key is `asof`). A part the run could not build is null and named in `reasons`. */
export interface MriRiskState {
    asof?: string | null;
    status?: string | null;
    dial?: { state?: 'full' | 'half' | null; rule?: string | null; since?: string | null } | null;
    price_rule?: { spy_close?: number | null; mean_200?: number | null; below?: boolean | null } | null;
    macro_reading?: {
        month?: string | null;
        recession_plus_stagflation?: number | null;
        top_third_threshold?: number | null;
        in_top_third?: boolean | null;
    } | null;
    vix_alarm?: { active?: boolean | null } | null;
    evidence?: { verdict?: string | null; n_months?: number | null } | null;
    degraded?: boolean | null;
    reasons?: string[] | null;
}

export async function fetchMriDailySummary(): Promise<MriDailySummary | null> {
    return fetchJson<MriDailySummary>('/data/mri/daily_diagnostic_summary.json');
}

export async function fetchMriRegimeTimeline(): Promise<MriRegimeTimeline | null> {
    return fetchJson<MriRegimeTimeline>('/data/mri/regime_timeline.json');
}

export async function fetchMriMacroFeatures(): Promise<MriMacroFeatures | null> {
    return fetchJson<MriMacroFeatures>('/data/mri/macro_features_timeline.json');
}

export async function fetchMriSectorRanking(): Promise<MriSectorRanking | null> {
    return fetchJson<MriSectorRanking>('/data/mri/current_sector_ranking.json');
}

export async function fetchMriSectorValidation(): Promise<MriSectorValidation | null> {
    return fetchJson<MriSectorValidation>('/data/mri/sector_validation.json');
}

export async function fetchMriRiskState(): Promise<MriRiskState | null> {
    return fetchJson<MriRiskState>('/data/mri/risk_state.json');
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
