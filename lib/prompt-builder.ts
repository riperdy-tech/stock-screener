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

    const prefix = market === 'None' ? '' : market === 'India' ? '₹' : market === 'Korea' ? '₩' : market === 'Taiwan' ? 'NT$' : '$';

    if (isPrice) {
        return `${prefix}${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }

    if (market === 'None') {
        return `${n.toFixed(decimals)}`;
    }

    if (market === 'India') {
        if (Math.abs(n) >= 1e7) return `${prefix}${(n / 1e7).toFixed(decimals)} Cr.`;
        return `${prefix}${n.toLocaleString('en-US', { maximumFractionDigits: decimals })}`;
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
    lines.push(`  Altman Z-Score      : ${Number(c.zScore).toFixed(2)}`);
    lines.push(``);
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    return lines.join('\n');
}

// ─── Main Export ──────────────────────────────────────────

export async function buildPrompt(ticker: string, result: ScreeningResult): Promise<string> {
    // Determine market context from ticker suffix
    let market: Market = 'US';
    if (ticker.endsWith('.NS') || ticker.endsWith('.BO')) market = 'India';
    if (ticker.endsWith('.KS') || ticker.endsWith('.KQ')) market = 'Korea';

    // Rely on rich financial detail embedded inside the CSV data pipeline
    const financialDetail = result.financialData;

    // Use rich data if available, otherwise fall back to screener summary
    const dataBrief = financialDetail
        ? formatFinancialData(financialDetail as FinancialDetail, market)
        : formatScreenerData(result, market);

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

    return `${rs2Content}\n\n### Company Ticker: ${ticker.toUpperCase()}\n\n${dataBrief}\n\n[DATA_BLOCK]\nAfter your full analysis above, append EXACTLY this JSON block (no markdown fences, no extra text) on its own line:\n{"conviction":<0-15 number>,"upside":"<number%>","action":"<BUY|ACCUMULATE|HOLD|SELL>","archetype":"<Stable Incumbent|Quality Compounder|Cyclical|Product-Platform Hybrid|Option-Led / High-Beta|Regulatory>","valuation_status":"<UNDERVALUED|FAIR_TO_UNDERVALUED|FAIR|OVERVALUED>"}\nReplace angle-bracket placeholders with your actual assessment values. Only this JSON object on the line after [DATA_BLOCK].`;
}

