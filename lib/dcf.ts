// Client-side mirror of scripts/build_valuation_models.py DCF math, so the
// Valuation Workbench can recompute fair value live as the user drags
// assumption sliders. Keep the two implementations in sync.

export interface DcfParams {
    baseCf: number;          // base-year cash flow (owner earnings or FCF)
    growth: number;          // stage-1 annual growth, e.g. 0.12
    wacc: number;            // discount rate, e.g. 0.10
    terminalGrowth?: number; // default 0.025
    stage1Years?: number;    // default 5
    fadeYears?: number;      // default 5
}

/** Present value of a two-stage FCF stream (stage-1 growth, linear fade to
 *  terminal, Gordon terminal value). Returns null when wacc <= terminal g. */
export function dcfValue({
    baseCf,
    growth,
    wacc,
    terminalGrowth = 0.025,
    stage1Years = 5,
    fadeYears = 5,
}: DcfParams): number | null {
    if (wacc <= terminalGrowth) return null;
    let pv = 0;
    let cf = baseCf;
    let year = 0;
    for (let i = 0; i < stage1Years; i++) {
        year += 1;
        cf *= 1 + growth;
        pv += cf / Math.pow(1 + wacc, year);
    }
    for (let i = 1; i <= fadeYears; i++) {
        year += 1;
        const gT = growth + ((terminalGrowth - growth) * i) / fadeYears;
        cf *= 1 + gT;
        pv += cf / Math.pow(1 + wacc, year);
    }
    const terminal = (cf * (1 + terminalGrowth)) / (wacc - terminalGrowth);
    pv += terminal / Math.pow(1 + wacc, year);
    return pv;
}

/** Bisection-solve the stage-1 growth implied by a target value (market cap).
 *  Mirrors solve_implied_growth in build_valuation_models.py. */
export function solveImpliedGrowth(
    baseCf: number,
    targetValue: number,
    wacc: number,
    terminalGrowth = 0.025,
): number | null {
    if (baseCf <= 0 || targetValue <= 0) return null;
    const G_LO = -0.5;
    const G_HI = 1.5;
    const value = (g: number) =>
        dcfValue({ baseCf, growth: g, wacc, terminalGrowth });
    const loV = value(G_LO);
    const hiV = value(G_HI);
    if (loV === null || hiV === null) return null;
    if (targetValue <= loV) return G_LO;
    if (targetValue >= hiV) return G_HI;
    let lo = G_LO;
    let hi = G_HI;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const v = value(mid);
        if (v === null) return null;
        if (v < targetValue) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}
