import { type ScreeningResult } from './blueprint';
import { type Market } from './data-service';

/**
 * Client-side prompt builder for the AI Prompt Exporter.
 * Loads per-ticker financial detail JSON (pre-computed during the scan phase)
 * and combines it with the valuation engine template.
 * 
 * Data flow:
 *   fetch_data.py → public/data/financials/{TICKER}.json (quarterly/annual statements, EV, FCF, etc.)
 *   prompt-builder.ts → loads that JSON + screener data → builds the full prompt
 */

// ─── Financial Detail Types ───────────────────────────────

interface IncomeRow {
    Date: string;
    TotalRevenue: number | null;
    GrossProfit: number | null;
    OperatingIncome: number | null;
    NetIncome: number | null;
}

interface FinancialDetail {
    Ticker: string;
    Data_Fetched_Date: string | null;
    Next_Earnings_Date: string | null;
    Price: number;
    Shares_Outstanding: number;
    Market_Cap: number;
    Enterprise_Value_EV: number;
    Total_Cash: number | null;
    Total_Debt: number | null;
    SBC_Stock_Based_Comp: number | null;
    Free_Cash_Flow_TTM: number | null;
    Operating_Cash_Flow: number | null;
    Capital_Expenditure: number | null;
    Annual_Income_Statement: IncomeRow[];
    Quarterly_Income_Statement: IncomeRow[];
    Calculated_Metrics: {
        TTM_Revenue: number | null;
        'TTM_Gross_Margin_%': number | null;
        'YoY_Revenue_Growth_%': number | null;
        'FCF_Margin_%': number | null;
        Rule_of_40: number | null;
        EV_to_Sales: number | null;
        EV_to_Gross_Profit: number | null;
        EV_to_EBIT: number | null;
        'Core_Anchor_Multiple_0.4Sales_0.4GP': number | null;
    };
}

// ─── Helpers ──────────────────────────────────────────────

function fmt(val: any, market: Market | 'None' = 'US', isPrice = false, decimals = 2): string {
    if (val === null || val === undefined) return 'N/A';
    const n = Number(val);
    if (isNaN(n)) return String(val);

    const prefix = market === 'None' ? '' : market === 'Korea' ? '₩' : market === 'Taiwan' ? 'NT$' : '$';

    if (isPrice) {
        return `${prefix}${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }

    if (market === 'None') {
        return `${n.toFixed(decimals)}`;
    }



    if (market === 'Korea') {
        if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(decimals)}조원`;
        if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(decimals)}억원`;
        if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(decimals)}만원`;
        return `${prefix}${n.toLocaleString('en-US', { maximumFractionDigits: decimals })}`;
    }

    if (market === 'Taiwan') {
        if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(decimals)}兆元`;
        if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(decimals)}億元`;
        if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(decimals)}萬元`;
        return `${prefix}${n.toLocaleString('en-US', { maximumFractionDigits: decimals })}`;
    }

    // US/Default scaling
    if (Math.abs(n) >= 1e9) return `${prefix}${(n / 1e9).toFixed(decimals)}B`;
    if (Math.abs(n) >= 1e6) return `${prefix}${(n / 1e6).toFixed(decimals)}M`;
    return `${prefix}${n.toFixed(decimals)}`;
}

// ─── Data Fetcher (Deprecated) ──────────────────────────────
// Now relies on embedded data in stocks.csv for immediate zero-latency access.

// ─── Format: Rich Financial Data (from get_ticker_data) ───

function formatFinancialData(d: FinancialDetail, market: Market = 'US'): string {
    const lines: string[] = [];

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`  FINANCIAL DATA BRIEF — ${d.Ticker}`);
    lines.push(`  Data As Of           : ${d.Data_Fetched_Date || 'Unknown'}`);
    lines.push(`  Next Earnings Report : ${d.Next_Earnings_Date || 'Not Available'}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(``);

    lines.push(`── MARKET SNAPSHOT ──────────────────────`);
    lines.push(`  Stock Price          : ${fmt(d.Price, market, true)}`);
    lines.push(`  Fully Diluted Shares: ${fmt(d.Shares_Outstanding, 'None')} ${market === 'Korea' ? '(Units)' : ''}`);
    lines.push(`  Market Cap          : ${fmt(d.Market_Cap, market)}`);
    lines.push(`  Enterprise Value    : ${fmt(d.Enterprise_Value_EV, market)}`);
    lines.push(`  Total Cash          : ${fmt(d.Total_Cash, market)}`);
    lines.push(`  Total Debt          : ${fmt(d.Total_Debt, market)}`);
    lines.push(`  Stock-Based Comp    : ${fmt(d.SBC_Stock_Based_Comp, market)}`);
    lines.push(`  Operating Cash Flow : ${fmt(d.Operating_Cash_Flow, market)}`);
    lines.push(`  CapEx               : ${fmt(d.Capital_Expenditure, market)}`);
    lines.push(`  Free Cash Flow TTM  : ${fmt(d.Free_Cash_Flow_TTM, market)}`);
    lines.push(``);

    const formatWithSuffix = (val: any, mkt: Market | 'None', suffix: string, decimals = 2) => {
        const formatted = fmt(val, mkt, false, decimals);
        return formatted === 'N/A' ? 'N/A' : `${formatted}${suffix}`;
    };

    const m = d.Calculated_Metrics || {} as any;
    lines.push(`── CALCULATED METRICS (TTM) ─────────────`);
    lines.push(`  TTM Revenue         : ${fmt(m.TTM_Revenue, market)}`);
    lines.push(`  Gross Margin        : ${formatWithSuffix(m['TTM_Gross_Margin_%'], 'None', '%', 1)}`);
    lines.push(`  YoY Revenue Growth  : ${formatWithSuffix(m['YoY_Revenue_Growth_%'], 'None', '%', 1)}`);
    lines.push(`  FCF Margin          : ${formatWithSuffix(m['FCF_Margin_%'], 'None', '%', 1)}`);
    lines.push(`  Rule of 40          : ${formatWithSuffix(m.Rule_of_40, 'None', ' pts', 1)}`);
    lines.push(`  EV / Sales          : ${formatWithSuffix(m.EV_to_Sales, 'None', 'x', 2)}`);
    lines.push(`  EV / Gross Profit   : ${formatWithSuffix(m.EV_to_Gross_Profit, 'None', 'x', 2)}`);
    lines.push(`  EV / EBIT           : ${formatWithSuffix(m.EV_to_EBIT, 'None', 'x', 2)}`);
    lines.push(`  Core Anchor Multiple: ${formatWithSuffix(m['Core_Anchor_Multiple_0.4Sales_0.4GP'], 'None', 'x', 2)}`);
    lines.push(``);

    const annuals: IncomeRow[] = d.Annual_Income_Statement || [];
    if (annuals.length > 0) {
        lines.push(`── ANNUAL INCOME STATEMENT ──────────────`);
        annuals.forEach((row) => {
            lines.push(`  Period: ${row.Date}`);
            lines.push(`    Revenue          : ${fmt(row.TotalRevenue, market)}`);
            lines.push(`    Gross Profit     : ${fmt(row.GrossProfit, market)}`);
            lines.push(`    Operating Income : ${fmt(row.OperatingIncome, market)}`);
            lines.push(`    Net Income       : ${fmt(row.NetIncome, market)}`);
        });
        lines.push(``);
    }

    const quarters: IncomeRow[] = d.Quarterly_Income_Statement || [];
    if (quarters.length > 0) {
        lines.push(`── QUARTERLY INCOME STATEMENT ───────────`);
        quarters.forEach((row) => {
            lines.push(`  Quarter: ${row.Date}`);
            lines.push(`    Revenue          : ${fmt(row.TotalRevenue, market)}`);
            lines.push(`    Gross Profit     : ${fmt(row.GrossProfit, market)}`);
            lines.push(`    Operating Income : ${fmt(row.OperatingIncome, market)}`);
            lines.push(`    Net Income       : ${fmt(row.NetIncome, market)}`);
        });
        lines.push(``);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    return lines.join('\n');
}

// ─── Format: Screener Data (fallback when no financial detail) ───

function formatScreenerData(result: ScreeningResult, market: Market = 'US'): string {
    const c = result.candidate;
    const lines: string[] = [];

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`  SCREENER DATA BRIEF — ${c.symbol}`);
    lines.push(`  (Detailed financials not available — using screener summary)`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(``);

    lines.push(`── COMPANY OVERVIEW ─────────────────────`);
    lines.push(`  Name                : ${c.name}`);
    lines.push(`  Sector              : ${c.sector}`);
    lines.push(`  Industry            : ${result.industry || 'N/A'}`);
    if (result.description) {
        lines.push(`  Description         : ${result.description}`);
    }
    lines.push(``);

    lines.push(`── MARKET SNAPSHOT ──────────────────────`);
    lines.push(`  Stock Price         : ${fmt(c.price, market, true)}`);
    lines.push(`  Market Cap          : ${fmt(c.marketCap, market)}`);
    lines.push(``);

    lines.push(`── KEY METRICS (from Screener) ──────────`);
    lines.push(`  Revenue Growth YoY  : ${Number(c.revenueGrowth).toFixed(1)}%`);
    lines.push(`  Gross Margin        : ${Number(c.grossMargin).toFixed(1)}%`);
    lines.push(`  ROIC                : ${Number(c.roic).toFixed(1)}%`);
    lines.push(`  PEG Ratio           : ${Number(c.pegRatio).toFixed(1)}x`);
    lines.push(`  Insider Ownership   : ${Number(c.insiderOwnership).toFixed(1)}%`);
    lines.push(`  Altman Z-Score      : ${c.zScore != null ? Number(c.zScore).toFixed(2) : 'N/A (not computable)'}`);
    lines.push(``);
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    return lines.join('\n');
}

// ─── Main Export ──────────────────────────────────────────

export async function buildPrompt(ticker: string, result: ScreeningResult): Promise<string> {
    // Determine market context from ticker suffix
    let market: Market = 'US';
    if (ticker.endsWith('.KS') || ticker.endsWith('.KQ')) market = 'Korea';
    else if (ticker.endsWith('.TW') || ticker.endsWith('.TWO')) market = 'Taiwan';

    // Load rich financial detail dynamically from the JSON file
    let financialDetail = result.financialData;
    if (!financialDetail && typeof window !== "undefined") {
        try {
            const basePath = '';
            const response = await fetch(`${basePath}/data/financials/${ticker.toUpperCase()}.json`);
            if (response.ok) {
                financialDetail = await response.json();
            }
        } catch (e) {
            console.error(`Failed to dynamically fetch financials for ${ticker}`, e);
        }
    }

    // Use rich data if available, otherwise fall back to screener summary
    const dataBrief = financialDetail
        ? formatFinancialData(financialDetail as FinancialDetail, market)
        : formatScreenerData(result, market);

    // Phase 11b: Reverse Engine priming block — injected between ticker header and financial data
    let reversePriming = "";
    const rev = result.reverse;
    if (rev && rev.rev_band && rev.rev_band !== "Excluded") {
        const parts: string[] = [];
        parts.push("## Reverse Screening Engine — Pre-Analysis Context");
        parts.push("");
        parts.push("This stock was nominated by the reverse screening engine for deep analysis.");
        parts.push("The engine's triage findings (NOT a verdict — your full v3.2 analysis decides):");
        parts.push("");
        if (rev.rev_archetype) {
            const archStr = rev.rev_archetype_secondary
                ? `${rev.rev_archetype} (+${rev.rev_archetype_secondary} transition)`
                : rev.rev_archetype;
            parts.push(`- Archetype: ${archStr}`);
        }
        if (rev.rev_composite != null) {
            parts.push(`- Reverse composite score: ${Math.round(rev.rev_composite)}/100 (band: ${rev.rev_band}, rank: #${rev.rev_rank ?? "?"})`);
        }
        if (rev.rev_mos != null) parts.push(`- Margin-of-safety proxy: ${Math.round(rev.rev_mos)}/100`);
        parts.push(`- Quality: ${rev.rev_quality ?? "?"}/100 | Survivability: ${rev.rev_survivability ?? "?"}/100 | Impairment prob: ${rev.rev_impairment_prob != null ? (rev.rev_impairment_prob * 100).toFixed(0) + "%" : "?"}`);
        if (rev.rev_cagr_proxy != null) {
            parts.push(`- CAGR proxy: ${rev.rev_cagr_proxy.toFixed(1)}% | Drawdown proxy: ${rev.rev_drawdown_proxy != null ? (rev.rev_drawdown_proxy * 100).toFixed(1) + "%" : "?"} | Efficiency: ${rev.rev_efficiency != null ? rev.rev_efficiency.toFixed(2) + "x" : "?"}`);
        }
        if (rev.rev_data_quality != null) parts.push(`- Data quality: ${rev.rev_data_quality}/5 | Route confidence: ${rev.rev_route_confidence ?? "?"}`);
        if (rev.rev_pro) parts.push(`- Strongest reason flagged: ${rev.rev_pro}`);
        if (rev.rev_con) parts.push(`- Strongest concern flagged: ${rev.rev_con}`);
        if (rev.rev_flags) {
            const flagList = rev.rev_flags.split(",").filter(f => f).join(", ");
            parts.push(`- Flags: ${flagList}`);
        }
        parts.push("");
        parts.push("Treat these as a starting hypothesis to verify and challenge, not as conclusions.");
        reversePriming = parts.join("\n") + "\n";
    }

    // Factor Lab valuation priming: implied-vs-evidenced growth from the
    // reverse-DCF model, so the deep engine starts from the expectations gap.
    let valuationPriming = "";
    if (market === 'US' && typeof window !== "undefined") {
        try {
            const response = await fetch(`/data/valuation_models.json`);
            if (response.ok) {
                const payload = await response.json();
                const vm = payload?.tickers?.[ticker.toUpperCase()];
                if (vm && vm.implied_growth !== null && vm.assumptions) {
                    const lines: string[] = [];
                    lines.push("## Reverse-DCF Expectations Context");
                    lines.push("");
                    lines.push(`- The CURRENT price implies ~${(vm.implied_growth * 100).toFixed(1)}%/yr cash-flow growth for 5 years (then fading to ${(vm.assumptions.terminal_growth * 100).toFixed(1)}%), discounted at ${vm.assumptions.wacc}% sector WACC.`);
                    if (vm.hist_revenue_cagr_5y != null) {
                        lines.push(`- Demonstrated 5y revenue CAGR (SEC filings): ${(vm.hist_revenue_cagr_5y * 100).toFixed(1)}%/yr.`);
                    }
                    if (vm.expectations_gap_pts != null) {
                        lines.push(`- Expectations gap: ${vm.expectations_gap_pts > 0 ? "+" : ""}${vm.expectations_gap_pts} points. ${vm.verdict ?? ""}`);
                    }
                    lines.push(`- Base cash flow used: ${vm.assumptions.base_cf_kind.replace(/_/g, " ")} (FY${vm.assumptions.fiscal_year}).`);
                    lines.push("");
                    lines.push("Interrogate this gap explicitly: what evidence would justify the implied growth, and what breaks the thesis if it doesn't materialize?");
                    valuationPriming = lines.join("\n") + "\n\n";
                }
            }
        } catch (e) {
            console.error(`Failed to fetch valuation model for ${ticker}`, e);
        }
    }

    let rs2Content = "";
    try {
        const basePath = '';
        if (typeof window !== "undefined") {
            const response = await fetch(`${basePath}/RS2.txt`);
            rs2Content = await response.text();
        } else {
            // Server side or edge
            const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
            const response = await fetch(`${baseUrl}${basePath}/RS2.txt`);
            rs2Content = await response.text();
        }
    } catch (e) {
        console.error("Failed to load RS2.txt", e);
        rs2Content = "Failed to load RS2.txt prompt template.";
    }

    return `${rs2Content}\n\n### Company Ticker: ${ticker.toUpperCase()}\n\n${reversePriming}${valuationPriming}${dataBrief}\n\n[DATA_BLOCK]\nAfter your full analysis above, you MUST append EXACTLY this JSON structure (NO markdown fences, NO extra text, multi-line with proper indentation). Replace ALL angle-bracket placeholders with actual numerical or string values from your analysis.\n\n{\n  "classification": {\n    "archetype": "<Stable Incumbent|Quality Compounder|Cyclical|Product-Platform Hybrid|Option-Led / High-Beta|Regulatory>",\n    "valuation_engine": "<Engine 1|Engine 2|Engine 3|Engine 4|Engine 5>",\n    "sector": "<SECTOR_NAME>",\n    "moat_score": <0.0-10.0>,\n    "moat_direction": "<WIDENING|STABLE|NARROWING>",\n    "financial_strength": "<EXCELLENT|GOOD|ADEQUATE|WEAK|CONCERNING>",\n    "summary": "<2-3 sentence company snapshot>"\n  },\n  "macro": {\n    "dominant_regime": "<Goldilocks|Reflation|Stagflation|Recession>",\n    "regime_probability": <0.0-1.0>,\n    "rate_sensitivity": <-3 to +3 integer>,\n    "dollar_sensitivity": <-3 to +3 integer>,\n    "macro_impact_score": <-3.0 to +3.0 float>,\n    "summary": "<2-3 sentence macro impact on this stock>"\n  },\n  "valuation": {\n    "current_price": <number>,\n    "intrinsic_value": <number>,\n    "margin_of_safety_pct": <number>,\n    "valuation_status": "<UNDERVALUED|FAIR_TO_UNDERVALUED|FAIR|OVERVALUED>",\n    "core_value": <number>,\n    "execution_value": <number>,\n    "ecosystem_value": <number>,\n    "drag_value": <number>,\n    "ev_to_sales": <number>,\n    "ev_to_gross_profit": <number>,\n    "fcf_yield_pct": <number>,\n    "summary": "<2-3 sentence valuation thesis>"\n  },\n  "scenarios": {\n    "bear_price": <number>,\n    "bear_probability": <0.0-1.0>,\n    "base_price": <number>,\n    "base_probability": <0.0-1.0>,\n    "bull_execution_price": <number>,\n    "bull_execution_probability": <0.0-1.0>,\n    "bull_ecosystem_price": <number>,\n    "bull_ecosystem_probability": <0.0-1.0>,\n    "expected_price": <number>,\n    "summary": "<2-3 sentence scenario rationale>"\n  },\n  "growth": {\n    "revenue_growth_1y_pct": <number>,\n    "revenue_growth_3y_cagr_pct": <number>,\n    "eps_growth_1y_pct": <number>,\n    "margin_trajectory": "<Expanding|Stable|Contracting>",\n    "free_cash_flow_1y_pct": <number>,\n    "rule_of_40": <number>,\n    "summary": "<2-3 sentence growth outlook>"\n  },\n  "verdict": {\n    "conviction": <0.0-15.0>,\n    "action": "<BUY|ACCUMULATE|HOLD|SELL>",\n    "upside_pct": <number>,\n    "rating": "<Overpriced|Fair|Underpriced>",\n    "top_risk": "<single most impactful risk>",\n    "top_catalyst": "<single most impactful catalyst>",\n    "position_size_pct": <0.0-10.0>,\n    "model_confidence": "<High|Medium|Low>",\n    "summary": "<2-3 sentence investment thesis>"\n  }\n}`;
}

