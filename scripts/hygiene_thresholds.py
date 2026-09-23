import json
from pathlib import Path
from typing import Optional, Tuple

MIN_MARKET_CAP: float = 300_000_000.0   # $300M
MIN_SHARE_PRICE: float = 3.00           # $3.00
MIN_ADV_DOLLAR: float = 300_000.0       # $300k/day

# P3.6b: forensic/solvency evidence (Beneish sales-growth bias, single-year FCF/op-loss
# leverage) is mostly built on small caps. At or above this market cap, those checks are a
# flag in front of the analyst instead of a silent veto — see PHASE_3_QUANT_BOOK.md P3.6b.
LARGE_CAP_FLAG_ONLY_USD: float = 10_000_000_000.0   # $10B

SIFTER_CONFIG_PATH = Path(__file__).resolve().with_name("sifter_config.json")


def load_adv_enforce(config_path: Path = SIFTER_CONFIG_PATH) -> bool:
    """C4: the $300k liquidity veto switch in sifter_config.json (ADV_ENFORCE).
    While False, names below $300k get the flag below_min_adv with their value, no veto.
    """
    if not config_path.exists():
        return False
    try:
        cfg = json.loads(config_path.read_text(encoding="utf-8"))
        if "ADV_ENFORCE" in cfg:
            return bool(cfg["ADV_ENFORCE"])
        if "adv_enforce" in cfg:
            return bool(cfg["adv_enforce"])
        sw = cfg.get("veto_switches", {})
        if "ADV_ENFORCE" in sw:
            return bool(sw["ADV_ENFORCE"])
        if "adv_enforce" in sw:
            return bool(sw["adv_enforce"])
    except Exception:
        pass
    return False


ADV_ENFORCE: bool = load_adv_enforce()


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


def resolve_market_cap(
    raw_mcap: Optional[float],
    price: Optional[float],
    shares_diluted: Optional[float] = None,
    metrics: Optional[dict] = None,
) -> Tuple[Optional[float], bool]:
    """C11: market cap 0.0 or missing is an absence, not 'tiny'.
    Derive market cap = price * latest diluted shares (fundamentals_history shares_diluted,
    or stocks metrics) when possible, stamped mcap_derived: True.
    If raw_mcap is present and > 0, return (raw_mcap, False).
    If derived, return (price * shares, True).
    If neither exists, return (None, False).
    """
    if raw_mcap is not None and raw_mcap > 0:
        return raw_mcap, False

    if price is not None and price > 0:
        shares = shares_diluted
        if (shares is None or shares <= 0) and metrics and isinstance(metrics, dict):
            for k in ("shares_diluted", "shares", "float"):
                v = metrics.get(k)
                if isinstance(v, (int, float)) and v > 0:
                    shares = float(v)
                    break
        if shares is not None and shares > 0:
            return price * shares, True

    return None, False
