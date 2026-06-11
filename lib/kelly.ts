// Client-side mirror of the quarter-Kelly sizing in
// scripts/build_portfolio_plan.py — keep both in sync.
//
// mu  = expected annual excess return if the expectations gap closes over
//       ~3 years; ONLY negative gaps (priced below demonstrated growth)
//       count as edge.
// f   = KELLY_FRACTION * mu / sigma^2, capped at POSITION_CAP_PCT.

export const KELLY_FRACTION = 0.25;
export const GAP_HORIZON_YEARS = 3.0;
export const MU_CAP = 0.15;
export const SIGMA_FLOOR = 0.15;
export const POSITION_CAP_PCT = 5.0;

export interface KellyInput {
    expectationsGapPts: number | null | undefined; // from valuation_models.json
    annualizedVol: number | null | undefined;      // fct_vol from factor_scores.json
}

export interface KellyResult {
    weightPct: number | null;  // suggested position size in %
    mu: number | null;         // expected annual excess used
    sigma: number | null;      // vol used (after floor)
    reason: string;            // human-readable basis or why null
}

export function quarterKelly({ expectationsGapPts, annualizedVol }: KellyInput): KellyResult {
    if (expectationsGapPts === null || expectationsGapPts === undefined) {
        return { weightPct: null, mu: null, sigma: null, reason: 'no expectations model' };
    }
    if (annualizedVol === null || annualizedVol === undefined || annualizedVol <= 0) {
        return { weightPct: null, mu: null, sigma: null, reason: 'no volatility estimate' };
    }
    const mu = Math.max(0, Math.min(MU_CAP, -expectationsGapPts / 100 / GAP_HORIZON_YEARS));
    if (mu === 0) {
        return {
            weightPct: 0, mu, sigma: annualizedVol,
            reason: `gap ${expectationsGapPts >= 0 ? '+' : ''}${expectationsGapPts.toFixed(0)}pts ≥ 0: price already assumes more growth than demonstrated — no measurable edge`,
        };
    }
    const sigma = Math.max(annualizedVol, SIGMA_FLOOR);
    const weightPct = Math.min(POSITION_CAP_PCT, 100 * (KELLY_FRACTION * mu) / (sigma * sigma));
    return {
        weightPct: Math.round(weightPct * 100) / 100,
        mu, sigma,
        reason: `μ=${(mu * 100).toFixed(1)}%/yr (gap recovery over ${GAP_HORIZON_YEARS}y), σ=${(sigma * 100).toFixed(0)}%`,
    };
}
