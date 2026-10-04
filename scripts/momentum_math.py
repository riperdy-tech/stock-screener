"""momentum_math.py — pure momentum arithmetic shared by the dual-door sifter and the momentum state.

Moved verbatim from score_paradigm.py when that lane was retired (2026-10-04). Inputs are
monthly closes, oldest-first; no files, no network.
"""

import bisect
import math


def compute_raw_return(prices, window):
    """Compute raw return for a given lookback window.

    prices: list of floats, oldest-first.
    window: number of months to look back (1, 3, 6, or 12).

    Returns the raw return (float) or None if insufficient data or non-finite.
    """
    if len(prices) < window + 1:
        return None
    p_new = prices[-1]
    p_old = prices[-1 - window]
    if p_old == 0 or not math.isfinite(p_old) or not math.isfinite(p_new):
        return None
    ret = (p_new / p_old) - 1.0
    if not math.isfinite(ret):
        return None
    return ret


def compute_skip_month_return(prices):
    """12-1 momentum: return from t-13 to t-1, excluding the most recent month.

    Standard construction (Jegadeesh-Titman): the latest month is skipped so
    short-term reversal doesn't contaminate the signal.
    """
    if len(prices) < 13:
        return None
    p_old = prices[-13]
    p_new = prices[-2]
    if p_old == 0 or not math.isfinite(p_old) or not math.isfinite(p_new):
        return None
    ret = (p_new / p_old) - 1.0
    return ret if math.isfinite(ret) else None


def compute_high_proximity(prices):
    """Proximity to the 52-week high (monthly-close proxy): last / max(last 12).

    Values near 1.0 = at the high (empirically bullish persistence); well
    below 1.0 = deep below the high.
    """
    if len(prices) < 12:
        return None
    window = prices[-12:]
    high = max(window)
    if high <= 0 or not math.isfinite(high):
        return None
    prox = prices[-1] / high
    return prox if math.isfinite(prox) else None


def compute_percentile_rank(value, sorted_distribution, count):
    """Compute percentile rank of value within a sorted distribution.

    Uses the standard 'average rank for ties' definition:
    rank = (count of values < this) / (count - 1)  if count > 1, else 0.5
    """
    if count <= 1:
        return 0.5
    less_count = bisect.bisect_left(sorted_distribution, value)
    return less_count / (count - 1)

