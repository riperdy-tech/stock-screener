import { ScreeningResult } from "./blueprint";

export type YoutubeStrategyFilter =
    | "any"
    | "earningsMomentum"
    | "deepValueReversal"
    | "turnaroundSeed"
    | "turnaroundScaleIn";

export interface StrategyCheck {
    passed: boolean;
    label: string;
    reasons: string[];
}

export interface YoutubeStrategyEvaluation {
    epsTtm: number | null;
    forwardEpsEstimate: number | null;
    priceToBook: number | null;
    currentPe: number | null;
    fiveYearAveragePe: number | null;
    monthlyMa20: number | null;
    hasDoubleBottom: boolean;
    hasConsecutiveMonthlyDeclines: boolean;
    maxPositionSize: string;
    riskTier: "standard" | "tiny_seed" | "tiny_negative_eps";
    matchedStrategies: string[];
    earningsMomentum: StrategyCheck;
    deepValueReversal: StrategyCheck;
    turnaroundSeed: StrategyCheck;
    turnaroundScaleIn: StrategyCheck;
}

type AnyRecord = Record<string, any>;

function asNumber(value: any): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string") {
        const cleaned = value.replace(/[%,$,x]/g, "").trim();
        if (!cleaned || cleaned.toLowerCase() === "nan" || cleaned.toLowerCase() === "n/a") return null;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(...values: any[]): number | null {
    for (const value of values) {
        const parsed = asNumber(value);
        if (parsed !== null) return parsed;
    }
    return null;
}

function getByPath(obj: any, path: string): any {
    return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

function firstPathNumber(obj: any, paths: string[]): number | null {
    for (const path of paths) {
        const parsed = asNumber(getByPath(obj, path));
        if (parsed !== null) return parsed;
    }
    return null;
}

function normalizeRows(rows: any[] | undefined | null): AnyRecord[] {
    if (!Array.isArray(rows)) return [];
    return rows
        .filter(Boolean)
        .map((row) => row as AnyRecord)
        .sort((a, b) => String(a.Date || a.date || "").localeCompare(String(b.Date || b.date || "")));
}

function getLargeCapThreshold(symbol: string): number {
    if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) return 500_000_000_000; // roughly 50,000 Cr INR
    if (symbol.endsWith(".KS") || symbol.endsWith(".KQ")) return 10_000_000_000_000; // roughly 10T KRW
    if (symbol.endsWith(".TW") || symbol.endsWith(".TWO")) return 300_000_000_000; // roughly 300B NTD
    return 10_000_000_000; // US default: $10B
}

function getQuarterlyEpsSeries(result: ScreeningResult): number[] {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;

    const directSeries = c.quarterlyEps || c.quarterlyEPS || fd.Quarterly_EPS || fd.QuarterlyEPS;
    if (Array.isArray(directSeries) && directSeries.length > 0) {
        return directSeries
            .map((value) => {
                if (typeof value === "object") {
                    return firstNumber(value.EPS, value.eps, value.BasicEPS, value.DilutedEPS, value.value);
                }
                return asNumber(value);
            })
            .filter((value): value is number => value !== null);
    }

    const fdDirectSeries = fd.Quarterly_EPS || fd.QuarterlyEPS;
    if (Array.isArray(fdDirectSeries) && fdDirectSeries.length > 0) {
        return fdDirectSeries
            .map((value) => asNumber(value))
            .filter((value): value is number => value !== null);
    }

    const shares = firstNumber(
        c.sharesOutstanding,
        c.floatShares,
        fd.Shares_Outstanding,
        fd.sharesOutstanding,
        fd.shares_outstanding
    );

    const rows = normalizeRows(fd.Quarterly_Income_Statement || fd.quarterlyIncomeStatement || fd.quarterly_income_statement);
    if (!shares || shares <= 0 || rows.length === 0) return [];

    return rows
        .map((row) => {
            const directEps = firstNumber(row.EPS, row.BasicEPS, row.DilutedEPS);
            if (directEps !== null) return directEps;
            const netIncome = firstNumber(row.NetIncome, row.netIncome);
            return netIncome === null ? null : netIncome / shares;
        })
        .filter((value): value is number => value !== null);
}

function getEpsTtm(result: ScreeningResult, quarterlyEps: number[]): number | null {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    const explicit = firstNumber(
        c.epsTtm,
        c.epsTTM,
        c.trailingEps,
        c.eps,
        fd.EPS_TTM,
        fd.TTM_EPS,
        fd.trailingEps,
        fd.epsTtm,
        fd.Calculated_Metrics?.EPS_TTM
    );
    if (explicit !== null) return explicit;

    if (quarterlyEps.length >= 4) {
        return quarterlyEps.slice(-4).reduce((sum, value) => sum + value, 0);
    }

    const shares = firstNumber(c.sharesOutstanding, fd.Shares_Outstanding);
    const rows = normalizeRows(fd.Quarterly_Income_Statement);
    if (shares && shares > 0 && rows.length >= 4) {
        const netIncomeTtm = rows
            .slice(-4)
            .map((row) => firstNumber(row.NetIncome, row.netIncome) || 0)
            .reduce((sum, value) => sum + value, 0);
        return netIncomeTtm / shares;
    }

    return null;
}

function getMonthlyCloses(result: ScreeningResult): number[] {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    const candidates = [
        c.monthlyCloses,
        c.monthly_closes,
        c.monthlyPrices,
        fd.Monthly_Closes,
        fd.monthlyCloses,
        fd.Monthly_Prices,
        fd.Price_History_Monthly,
        fd.priceHistoryMonthly,
    ];

    for (const candidate of candidates) {
        if (!Array.isArray(candidate) || candidate.length === 0) continue;
        const closes = candidate
            .map((item) => {
                if (typeof item === "object") {
                    return firstNumber(item.Close, item.close, item.AdjClose, item.adjClose, item.Price, item.price, item.value);
                }
                return asNumber(item);
            })
            .filter((value): value is number => value !== null && value > 0);
        if (closes.length > 0) return closes;
    }

    return [];
}

function movingAverage(values: number[], period: number): number | null {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    return slice.reduce((sum, value) => sum + value, 0) / period;
}

function hasConsecutiveMonthlyDeclines(monthlyCloses: number[], months = 3): boolean {
    if (monthlyCloses.length < months + 1) return false;
    const recent = monthlyCloses.slice(-(months + 1));
    return recent.every((value, index) => index === recent.length - 1 || value > recent[index + 1]);
}

function detectMonthlyDoubleBottom(monthlyCloses: number[], tolerance = 0.08, minSeparation = 3): boolean {
    if (monthlyCloses.length < 10) return false;

    const lows: Array<{ index: number; price: number }> = [];
    for (let i = 1; i < monthlyCloses.length - 1; i++) {
        if (monthlyCloses[i] < monthlyCloses[i - 1] && monthlyCloses[i] < monthlyCloses[i + 1]) {
            lows.push({ index: i, price: monthlyCloses[i] });
        }
    }

    for (let i = 0; i < lows.length; i++) {
        for (let j = i + 1; j < lows.length; j++) {
            const first = lows[i];
            const second = lows[j];
            if (second.index - first.index < minSeparation) continue;

            const bottomSimilarity = Math.abs(first.price - second.price) / Math.min(first.price, second.price);
            if (bottomSimilarity > tolerance) continue;

            const neckline = Math.max(...monthlyCloses.slice(first.index, second.index + 1));
            const currentPrice = monthlyCloses[monthlyCloses.length - 1];
            if (currentPrice >= neckline * 0.95) return true;
        }
    }

    return false;
}

function getEpsYoyGrowth(result: ScreeningResult): number | null {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    return firstNumber(
        c.epsYoyGrowth,
        fd.Calculated_Metrics?.EPS_YoY_Growth,
        fd.EPS_YoY_Growth
    );
}

function getPriorYearTtmEps(result: ScreeningResult): number | null {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    return firstNumber(
        c.priorYearTtmEps,
        fd.Calculated_Metrics?.Prior_Year_TTM_EPS,
        fd.Prior_Year_TTM_EPS
    );
}

function getRevenueYoyGrowth(result: ScreeningResult): number | null {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    return firstNumber(
        c.revenueYoyGrowth,
        c.revenueGrowth, // Fallback to generic rev growth
        fd.Calculated_Metrics?.YoY_Revenue_Growth_Pct,
        fd.Calculated_Metrics?.YoY_Revenue_Growth,
        fd.Calculated_Metrics?.Revenue_YoY_Growth
    );
}

function getForwardEpsEstimate(result: ScreeningResult): number | null {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    return firstNumber(
        c.forwardEpsEstimate,
        c.forwardEPS,
        c.forwardEps,
        c.nextYearEps,
        fd.Forward_EPS_Estimate,
        fd.forwardEpsEstimate,
        fd.Forward_EPS,
        fd.Analyst_Estimates?.Forward_EPS,
        fd.Earnings_Estimates?.Forward_EPS,
        fd.Calculated_Metrics?.Forward_EPS_Estimate
    );
}

function getPriceToBook(result: ScreeningResult): number | null {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    return firstNumber(
        c.priceToBook,
        c.pbRatio,
        c.priceBook,
        fd.Price_to_Book,
        fd.PriceToBook,
        fd.PB_Ratio,
        fd.Calculated_Metrics?.Price_to_Book,
        fd.Calculated_Metrics?.PB_Ratio
    );
}

function getCurrentPe(result: ScreeningResult, epsTtm: number | null): number | null {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    const explicit = firstNumber(
        c.peRatio,
        c.trailingPE,
        c.currentPe,
        c.currentPE,
        fd.Current_PE,
        fd.PE_Ratio,
        fd.Trailing_PE,
        fd.Calculated_Metrics?.PE_Ratio
    );
    if (explicit !== null && explicit > 0) return explicit;
    if (epsTtm && epsTtm > 0 && c.price > 0) return c.price / epsTtm;
    return null;
}

function getFiveYearAveragePe(result: ScreeningResult): number | null {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    return firstNumber(
        c.pe5yAverage,
        c.fiveYearAveragePe,
        c.avgPe5y,
        fd.Five_Year_Average_PE,
        fd.PE_5Y_Avg,
        fd.PE_5Y_Average,
        fd.Historical_PE_5Y_Average,
        fd.Calculated_Metrics?.PE_5Y_Avg
    );
}

function makeCheck(passed: boolean, label: string, reasons: string[]): StrategyCheck {
    return { passed, label, reasons };
}

export function evaluateYoutubeStrategy(result: ScreeningResult): YoutubeStrategyEvaluation {
    const c = result.candidate as AnyRecord;
    const fd = (result.financialData || {}) as AnyRecord;
    const quarterlyEps = getQuarterlyEpsSeries(result);
    const epsTtm = getEpsTtm(result, quarterlyEps);
    const forwardEpsEstimate = getForwardEpsEstimate(result);
    const priceToBook = getPriceToBook(result);
    const currentPe = getCurrentPe(result, epsTtm);
    const fiveYearAveragePe = getFiveYearAveragePe(result);
    const monthlyCloses = getMonthlyCloses(result);
    const monthlyMa20 = firstNumber(c.monthlyMa20, c.monthlyMA20) ?? firstPathNumber(fd, [
        "Monthly_MA_20",
        "monthlyMa20",
        "Calculated_Metrics.Monthly_MA_20",
    ]) ?? movingAverage(monthlyCloses, 20);
    const hasDoubleBottom = detectMonthlyDoubleBottom(monthlyCloses);
    const hasMonthlyDeclines = hasConsecutiveMonthlyDeclines(monthlyCloses, 3);
    const epsYoyGrowth = getEpsYoyGrowth(result);
    const priorYearTtmEps = getPriorYearTtmEps(result);
    const revenueYoyGrowth = getRevenueYoyGrowth(result);

    const currentPrice = firstNumber(c.price, fd.Price) || 0;
    const largeCap = (firstNumber(c.marketCap, fd.Market_Cap) || 0) >= getLargeCapThreshold(c.symbol || "");
    const epsPositive = epsTtm !== null && epsTtm > 0;
    const epsNegative = epsTtm !== null && epsTtm < 0;

    const earningsReasons: string[] = [];
    if (!largeCap) earningsReasons.push("Market cap is below the large-cap blue-chip threshold.");
    
    // Fallback: If we lack explicit YoY momentum fields, we check if EPS is positive and growing overall.
    // If SEC data is populated, it will use the explicit fields.
    const hasExplicitYoY = epsYoyGrowth !== null && priorYearTtmEps !== null && revenueYoyGrowth !== null;

    let earningsMomentumPassed = false;
    if (hasExplicitYoY) {
        if (epsYoyGrowth! <= 0 && !(epsNegative && epsYoyGrowth! > 0)) {
            earningsReasons.push("Latest quarter diluted EPS YoY growth must be > 0 (or loss narrowing).");
        }
        if (epsTtm! <= priorYearTtmEps!) {
            earningsReasons.push("Latest TTM EPS must be > prior-year TTM EPS.");
        }
        if (revenueYoyGrowth! <= 0) {
            earningsReasons.push("Latest quarter revenue YoY growth must be > 0.");
        }
        if (earningsReasons.length === 0 || (earningsReasons.length === 1 && !largeCap)) {
            // We only fail if the actual momentum rules fail, or if it's not a large cap.
            earningsMomentumPassed = largeCap && epsYoyGrowth! > 0 && epsTtm! > priorYearTtmEps! && revenueYoyGrowth! > 0;
        }
    } else {
        // Fallback Yahoo logic: Check if EPS is positive and Revenue YoY > 0
        if (!epsPositive) earningsReasons.push("EPS TTM is not positive.");
        if (revenueYoyGrowth === null || revenueYoyGrowth <= 0) earningsReasons.push("Requires positive Revenue YoY growth.");
        
        // As a rough proxy for TTM EPS > Prior Year TTM EPS, we check if net income grew if we have 8 quarters.
        // But since we often don't, we just require positive EPS and positive Rev growth for the fallback.
        earningsMomentumPassed = largeCap && epsPositive && (revenueYoyGrowth !== null && revenueYoyGrowth > 0);
    }

    const valueReasons: string[] = [];
    const undervaluedByBook = priceToBook !== null && priceToBook < 1;
    const undervaluedByPe = currentPe !== null && fiveYearAveragePe !== null && currentPe < fiveYearAveragePe;
    if (!undervaluedByBook && !undervaluedByPe) {
        valueReasons.push("Needs P/B < 1.0 or current P/E below 5-year average P/E.");
    }
    if (!hasDoubleBottom) valueReasons.push("Monthly double-bottom pattern was not detected or monthly prices are unavailable.");
    if (monthlyMa20 === null || currentPrice < monthlyMa20) valueReasons.push("Price must be at or above the 20-month moving average.");
    const deepValuePassed = (undervaluedByBook || undervaluedByPe) && hasDoubleBottom && monthlyMa20 !== null && currentPrice >= monthlyMa20;

    const seedReasons: string[] = [];
    if (!epsNegative) seedReasons.push("EPS must currently be negative for a turnaround seed.");
    if (!hasMonthlyDeclines) seedReasons.push("Needs three consecutive monthly price declines.");
    if (forwardEpsEstimate === null || epsTtm === null || forwardEpsEstimate <= epsTtm) {
        seedReasons.push("Forward EPS estimate must be higher than current EPS.");
    }
    const seedPassed = epsNegative && hasMonthlyDeclines && forwardEpsEstimate !== null && forwardEpsEstimate > epsTtm;

    const scaleReasons: string[] = [];
    const priorEps = firstNumber(c.previousEpsTtm, c.previousEPS, fd.Previous_EPS_TTM, fd.previousEpsTtm);
    if (!(priorEps !== null && priorEps < 0 && epsPositive)) {
        scaleReasons.push("Scale-in requires previous EPS to be negative and actual reported EPS to have flipped positive.");
    }
    const scalePassed = priorEps !== null && priorEps < 0 && epsPositive;

    const matchedStrategies = [
        earningsMomentumPassed ? "Earnings Momentum" : null,
        deepValuePassed ? "Deep Value + Technical Reversal" : null,
        seedPassed ? "Turnaround Seed" : null,
        scalePassed ? "Turnaround Scale-In" : null,
    ].filter((value): value is string => Boolean(value));

    let riskTier: YoutubeStrategyEvaluation["riskTier"] = "standard";
    let maxPositionSize = "Standard portfolio weighting";
    if (seedPassed) {
        riskTier = "tiny_seed";
        maxPositionSize = "0.01% max seed position";
    } else if (epsNegative) {
        riskTier = "tiny_negative_eps";
        maxPositionSize = "0.01%–0.05% max position";
    }

    return {
        epsTtm,
        forwardEpsEstimate,
        priceToBook,
        currentPe,
        fiveYearAveragePe,
        monthlyMa20,
        hasDoubleBottom,
        hasConsecutiveMonthlyDeclines: hasMonthlyDeclines,
        maxPositionSize,
        riskTier,
        matchedStrategies,
        earningsMomentum: makeCheck(earningsMomentumPassed, "Earnings Momentum", earningsReasons),
        deepValueReversal: makeCheck(deepValuePassed, "Deep Value + Technical Reversal", valueReasons),
        turnaroundSeed: makeCheck(seedPassed, "Turnaround Seed", seedReasons),
        turnaroundScaleIn: makeCheck(scalePassed, "Turnaround Scale-In", scaleReasons),
    };
}

export function matchesYoutubeStrategyFilter(evaluation: YoutubeStrategyEvaluation, filter: YoutubeStrategyFilter): boolean {
    if (filter === "any") return evaluation.matchedStrategies.length > 0;
    if (filter === "earningsMomentum") return evaluation.earningsMomentum.passed;
    if (filter === "deepValueReversal") return evaluation.deepValueReversal.passed;
    if (filter === "turnaroundSeed") return evaluation.turnaroundSeed.passed;
    if (filter === "turnaroundScaleIn") return evaluation.turnaroundScaleIn.passed;
    return false;
}

export function formatStrategyNumber(value: number | null, decimals = 2): string {
    return value === null || Number.isNaN(value) ? "N/A" : value.toFixed(decimals);
}
