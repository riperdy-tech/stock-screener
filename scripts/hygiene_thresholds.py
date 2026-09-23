"""hygiene_thresholds.py — Shared retail hygiene thresholds for Tier 1 and SCR-03b (P3.6)."""

from typing import Optional, Tuple

MIN_MARKET_CAP: float = 300_000_000.0   # $300M
MIN_SHARE_PRICE: float = 3.00           # $3.00
MIN_ADV_DOLLAR: float = 300_000.0       # $300k/day

# P3.6b: forensic/solvency evidence (Beneish sales-growth bias, single-year FCF/op-loss
# leverage) is mostly built on small caps. At or above this market cap, those checks are a
# flag in front of the analyst instead of a silent veto — see PHASE_3_QUANT_BOOK.md P3.6b.
LARGE_CAP_FLAG_ONLY_USD: float = 10_000_000_000.0   # $10B


def resolve_adv_usd(
    stocks_adv_20d_usd: Optional[float],
    momentum_adv_20d_usd: Optional[float],
    vol: Optional[float],
    price: Optional[float],
) -> Tuple[Optional[float], Optional[str]]:
    """P3.6c: resolve a name's average dollar volume, in priority order —
    stocks[t].metrics.adv_20d_usd (new, universe-wide, from the daily fetch; empty until the
    next cloud fetch populates it) -> momentum_state.json's adv_20d_usd (SCR-10) -> the
    single-day snapshot vol * price (flagged "adv_single_day") -> None (no value at all).

    Shared by Tier 1 (filter_tier1_hygiene.py) and SCR-03b (score_factors_dual_door.py) so
    both engines agree on what "no liquidity data" means. Callers pass already-numeric inputs
    (None is an absence, never defaulted). Returns (adv_usd_or_None, flag_or_None); the flag
    is "adv_single_day" only on the snapshot branch.
    """
    if stocks_adv_20d_usd is not None:
        return stocks_adv_20d_usd, None
    if momentum_adv_20d_usd is not None:
        return momentum_adv_20d_usd, None
    if vol is not None and price is not None:
        return vol * price, "adv_single_day"
    return None, None
