export interface StockCandidate {
    symbol: string;
    name: string;
    sector: string;
    industry: string;
    price: number;
    marketCap: number;
    peRatio: number;
    pegRatio: number;
    priceToSales: number;
    revenueGrowth: number; // YoY %
    grossMargin: number; // %
    roic: number; // %
    zScore: number;
    insiderOwnership: number; // %
    floatShares: number;
}

export interface ScreeningMetrics {
    roic: number;
    revenueGrowth: number;
    grossMargin: number;
    netIncome: number;
    operatingCashFlow: number;
    zScore: number;
    mScore: number;
    insiderOwnership: number;
    dilution: number;
    psRatio: number;
    pegRatio: number;
    float: number;
}

export interface ScreeningResult {
    candidate: StockCandidate;
    passed: boolean;
    score: number; // 0-100 match score
    reasons: string[]; // Why it failed or passed
    flags: string[]; // Kill list items triggered
    metrics?: ScreeningMetrics; // Optional because mock data might miss it
    industry?: string;
    description?: string;
}

// Phase 1: Quantitative Filters
export const QUANT_THRESHOLDS = {
    MIN_MARKET_CAP: 50_000_000, // $50M
    MAX_MARKET_CAP: 2_000_000_000, // $2B (Soft target, we can allow up to 10B for "Near Misses")
    MAX_PRICE: 25, // < $25
    MIN_REVENUE_GROWTH: 20, // > 20%
    MIN_GROSS_MARGIN_CONSUMER: 30, // > 30%
    MIN_GROSS_MARGIN_TECH: 50, // > 50%
    MIN_ROIC: 15, // > 15%
    MAX_PEG: 1.5, // < 1.5
    MAX_PS_CONSUMER: 3, // < 3x
    MAX_PS_TECH: 10, // < 10x
    MIN_INSIDER_OWNERSHIP: 15, // > 15%
};

// Phase 2: Kill List (Negative Constraints)
export const KILL_LIST = {
    MAX_Z_SCORE_DISTRESS: 1.8, // < 1.8 is Distress
};

export function analyzeStock(stock: StockCandidate): ScreeningResult {
    const reasons: string[] = [];
    const flags: string[] = [];
    let score = 0;
    let passed = true;

    const isTech = stock.sector === "Technology" || stock.sector === "Communication Services";

    // --- Phase 1: Quant Checks ---

    // Market Cap (Allowing some leeway for larger winners to show up in benchmarks)
    if (stock.marketCap < QUANT_THRESHOLDS.MIN_MARKET_CAP) {
        passed = false;
        reasons.push(`Market Cap too small ($${(stock.marketCap / 1e6).toFixed(1)}M)`);
    } else if (stock.marketCap > QUANT_THRESHOLDS.MAX_MARKET_CAP) {
        // We don't fail strictly on max cap, but we note it
        reasons.push(`Market Cap above target range ($${(stock.marketCap / 1e9).toFixed(1)}B)`);
    } else {
        score += 10;
    }

    // Share Price
    if (stock.price > QUANT_THRESHOLDS.MAX_PRICE) {
        // again, maybe not a hard fail for existing compounders, but a penalty
        score -= 5;
        reasons.push(`Price > $25 ($${stock.price.toFixed(2)})`);
    } else {
        score += 10;
    }

    // Revenue Growth
    if (stock.revenueGrowth < QUANT_THRESHOLDS.MIN_REVENUE_GROWTH) {
        passed = false;
        reasons.push(`Low Revenue Growth (${stock.revenueGrowth.toFixed(1)}%)`);
    } else {
        score += 20;
    }

    // Gross Margin
    const minMargin = isTech ? QUANT_THRESHOLDS.MIN_GROSS_MARGIN_TECH : QUANT_THRESHOLDS.MIN_GROSS_MARGIN_CONSUMER;
    if (stock.grossMargin < minMargin) {
        passed = false;
        reasons.push(`Low Gross Margin (${stock.grossMargin}%) for ${isTech ? 'Tech' : 'Consumer'}`);
    } else {
        score += 15;
    }

    // ROIC
    if (stock.roic < QUANT_THRESHOLDS.MIN_ROIC) {
        if (stock.roic > 10) {
            // Near miss
            reasons.push(`ROIC close to threshold (${stock.roic}%)`);
        } else {
            passed = false;
            reasons.push(`Low ROIC (${stock.roic}%)`);
        }
    } else {
        score += 20;
    }

    // PEG
    if (stock.pegRatio > QUANT_THRESHOLDS.MAX_PEG) {
        reasons.push(`High PEG (${stock.pegRatio})`);
    } else {
        score += 10;
    }

    // Insider Ownership
    if (stock.insiderOwnership < QUANT_THRESHOLDS.MIN_INSIDER_OWNERSHIP) {
        reasons.push(`Low Insider Ownership (${stock.insiderOwnership.toFixed(1)}%)`);
    } else {
        score += 15;
    }

    // --- Phase 2: Kill List ---

    // Altman Z-Score
    if (stock.zScore < KILL_LIST.MAX_Z_SCORE_DISTRESS) {
        passed = false;
        flags.push(`Financial Distress (Z-Score: ${stock.zScore})`);
        score = 0; // Immediate kill
    }

    return { candidate: stock, passed, score: Math.max(0, Math.min(100, score)), reasons, flags };
}
