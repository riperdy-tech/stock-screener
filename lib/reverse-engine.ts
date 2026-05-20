import { type StockCandidate } from "./blueprint";

export interface ReverseEngineInput extends StockCandidate {
    ocf?: number | null;
    capex?: number | null;
    epsTtm?: number | null;
    previousEpsTtm?: number | null;
}

export interface ReverseEngineScore {
    score: number;
    passed: boolean;
    rating: "RESEARCH_PRIORITY" | "REVIEW" | "WATCHLIST" | "LOW_PRIORITY";
    qualityScore: number;
    valuationScore: number;
    growthScore: number;
    resilienceScore: number;
    drawdownScore: number;
    efficiency: number;
    estimatedFcfYield: number | null;
    failCodes: string[];
    reasons: string[];
    warnings: string[];
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function rangeScore(v: number, low: number, high: number): number {
    if (!isNum(v)) return 0;
    return clamp(((v - low) / (high - low)) * 100);
}

function inverseScore(v: number, good: number, bad: number): number {
    if (!isNum(v) || v <= 0) return 50;
    return clamp(((bad - v) / (bad - good)) * 100);
}

function fcfYieldPct(stock: ReverseEngineInput): number | null {
    if (!isNum(stock.marketCap) || stock.marketCap <= 0) return null;
    if (!isNum(stock.ocf) || !isNum(stock.capex)) return null;
    const fcf = stock.ocf - Math.abs(stock.capex);
    return (fcf / stock.marketCap) * 100;
}

function epsGrowthPct(stock: ReverseEngineInput): number | null {
    if (!isNum(stock.epsTtm) || !isNum(stock.previousEpsTtm) || stock.previousEpsTtm === 0) return null;
    return ((stock.epsTtm - stock.previousEpsTtm) / Math.abs(stock.previousEpsTtm)) * 100;
}

export function calculateReverseEngineScore(stock: ReverseEngineInput): ReverseEngineScore {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const failCodes: string[] = [];

    const fcfYield = fcfYieldPct(stock);
    const epsGrowth = epsGrowthPct(stock);

    const revenueScore = rangeScore(stock.revenueGrowth, 0, 30);
    const marginScore = rangeScore(stock.grossMargin, 20, 65);
    const roicScore = rangeScore(stock.roic, 5, 25);
    const qualityScore = clamp(roicScore * 0.45 + marginScore * 0.35 + revenueScore * 0.20);

    const fcfScore = fcfYield === null ? 45 : rangeScore(fcfYield, 1, 8);
    const psScore = inverseScore(stock.priceToSales, 2, 12);
    const pegScore = stock.pegRatio > 0 ? inverseScore(stock.pegRatio, 0.8, 2.5) : 50;
    const peScore = stock.peRatio > 0 ? inverseScore(stock.peRatio, 12, 45) : 50;
    const valuationScore = clamp(fcfScore * 0.35 + psScore * 0.30 + pegScore * 0.20 + peScore * 0.15);

    const epsScore = epsGrowth === null ? 50 : rangeScore(epsGrowth, 0, 30);
    const growthScore = clamp(revenueScore * 0.65 + epsScore * 0.35);

    const zScore = stock.zScore > 0 ? rangeScore(stock.zScore, 1.8, 5.0) : 50;
    const insiderScore = rangeScore(stock.insiderOwnership, 0, 20);
    const fcfPositiveScore = fcfYield === null ? 50 : fcfYield > 0 ? 100 : 0;
    const resilienceScore = clamp(zScore * 0.45 + fcfPositiveScore * 0.35 + insiderScore * 0.20);

    let drawdownScore = 100;
    if (stock.zScore > 0 && stock.zScore < 1.8) drawdownScore -= 45;
    if (fcfYield !== null && fcfYield < 0) drawdownScore -= 25;
    if (stock.priceToSales > 10) drawdownScore -= 15;
    if (stock.pegRatio > 2.5) drawdownScore -= 10;
    if (stock.marketCap > 0 && stock.marketCap < 100_000_000) drawdownScore -= 10;
    if (stock.roic < 5) drawdownScore -= 10;
    drawdownScore = clamp(drawdownScore);

    const cagrProxy = clamp(growthScore * 0.45 + valuationScore * 0.30 + qualityScore * 0.25);
    const drawdownProxy = clamp(100 - drawdownScore + Math.max(0, 60 - valuationScore) * 0.30, 1, 100);
    const efficiency = Number((cagrProxy / drawdownProxy).toFixed(2));

    const score = Math.round(clamp(
        cagrProxy * 0.30 +
        valuationScore * 0.25 +
        qualityScore * 0.20 +
        resilienceScore * 0.15 +
        drawdownScore * 0.10
    ));

    if (stock.marketCap > 0 && stock.marketCap < 50_000_000) {
        failCodes.push("FAIL_SIZE");
        reasons.push("Market cap is below the minimum useful range for this research screen.");
    }
    if (stock.zScore > 0 && stock.zScore < 1.8) {
        failCodes.push("FAIL_DISTRESS");
        reasons.push("Balance-sheet distress risk is elevated.");
    }
    if (fcfYield !== null && fcfYield < -5) {
        failCodes.push("FAIL_CASH_BURN");
        reasons.push("Free cash flow yield is materially negative.");
    }
    if (valuationScore < 35 && qualityScore < 60) {
        failCodes.push("FAIL_NO_MARGIN_OF_SAFETY");
        reasons.push("The screen does not show enough valuation support relative to quality.");
    }
    if (efficiency < 1.0) {
        failCodes.push("FAIL_EFFICIENCY");
        reasons.push("The estimated compounding profile is weak relative to drawdown risk.");
    }

    if (fcfYield === null) warnings.push("FCF yield unavailable; valuation score uses fallback metrics.");
    if (!stock.pegRatio || stock.pegRatio <= 0) warnings.push("PEG unavailable; PEG score is neutralized.");
    if (!stock.zScore || stock.zScore <= 0) warnings.push("Z-score unavailable; resilience score is neutralized.");

    const passed = score >= 70 && failCodes.length === 0 && efficiency >= 1.25;
    const rating: ReverseEngineScore["rating"] = passed
        ? "RESEARCH_PRIORITY"
        : score >= 65 && efficiency >= 1.0
            ? "REVIEW"
            : score >= 50
                ? "WATCHLIST"
                : "LOW_PRIORITY";

    if (passed) {
        reasons.push("Passes v3.2 reverse screen: quality, valuation, resilience, and efficiency are acceptable.");
    } else if (reasons.length === 0) {
        reasons.push("Does not yet meet v3.2 reverse-screen threshold.");
    }

    return {
        score,
        passed,
        rating,
        qualityScore: Math.round(qualityScore),
        valuationScore: Math.round(valuationScore),
        growthScore: Math.round(growthScore),
        resilienceScore: Math.round(resilienceScore),
        drawdownScore: Math.round(drawdownScore),
        efficiency,
        estimatedFcfYield: fcfYield === null ? null : Number(fcfYield.toFixed(2)),
        failCodes,
        reasons,
        warnings,
    };
}
