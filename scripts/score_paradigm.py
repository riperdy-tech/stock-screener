"""
score_paradigm.py — Composite theme-membership tagger (WS1-T2a) + economics gate (WS1-T4)
                      + momentum score (WS1-T3b) + theme metrics (WS1-T3b)
                      + signal/band/rank/pro-con (WS1-T5)
                      + momentum acceleration (WS1-T8a)
                      + forward-EPS gate bridge (WS1-T8b)
                      + analyst-coverage gate uplift (WS1-T8c).

Reads paradigm_config.json (keywords + negative_keywords + gics_industries +
seed_tickers per theme), evaluates three independent methods per stock per theme,
and tags the stock with every theme whose composite score >= 2.

Multi-theme is allowed (e.g., TSLA in both physical_ai AND energy_transition).

WS1-T4 adds pdm_economics_gate computation using rev_quality and rev_survivability
from the reverse object (frozen, read-only). The multiplicative formula zeroes out
narrative-only stocks with no real economics.

WS1-T3b adds pdm_momentum_score computation from price_history.json using
universe-relative percentile-rank composite across 4 lookback windows (1m, 3m, 6m, 12m)
with weights 0.10/0.20/0.30/0.40. Also writes paradigm_theme_metrics.json with
per-theme breadth scores.

WS1-T5 adds pdm_signal (three-factor product), pdm_band (conviction tier),
pdm_rank (ordinal rank), pdm_pro and pdm_con (mechanical templates).

WS1-T8a adds a Delta-percentile-rank acceleration component to pdm_momentum_score.
The final momentum score blends the static 4-window composite (weight 0.6) with the
cross-sectionally-ranked acceleration signal (weight 0.4). Also surfaces
accelerating/decelerating/regime_shift_up/regime_shift_down flags.

WS1-T8b adds a forward-EPS bridge to pdm_economics_gate. When rev_survivability >= 25
AND eps_trajectory.json has forward EPS data for the ticker, a bridge_score (capped at 35)
can lift the gate via max(raw_gate, bridge). This addresses the scale-phase / AMZN-1999
case where current GAAP looks weak but forward trajectory is real. Reads optional
public/data/eps_trajectory.json (gracefully skipped if absent).

WS1-T8c adds a small analyst-coverage uplift to pdm_economics_gate. Reads optional
public/data/analyst_coverage.json (gracefully skipped if absent). Uplift is capped at
+15 and only fires for stocks with theme membership.

ADDITIVE — only modifies the paradigm object on each stock.
"""

import json
import math
import re
import bisect
import statistics
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# ── Paths (mirror score_reverse.py pattern) ──────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STOCKS_JSON = DATA_DIR / "stocks.json"
REVERSE_SCORES_JSON = DATA_DIR / "reverse_scores.json"
PARADIGM_SCORES_JSON = DATA_DIR / "paradigm_scores.json"
CONFIG_JSON = Path(__file__).resolve().with_name("paradigm_config.json")
OVERRIDES_JSON = DATA_DIR / "paradigm_overrides.json"
SECTORS_ENRICHED_JSON = DATA_DIR / "sectors_enriched.json"
PRICE_HISTORY_JSON = DATA_DIR / "price_history.json"
THEME_METRICS_JSON = DATA_DIR / "paradigm_theme_metrics.json"
# Same file is also read at start for dynamic-threshold feedback (prior run's metrics).
EPS_TRAJECTORY_JSON = DATA_DIR / "eps_trajectory.json"
ANALYST_COVERAGE_JSON = DATA_DIR / "analyst_coverage.json"
MACRO_STATE_JSON = DATA_DIR / "macro_state.json"
THEME_LLM_JSON = DATA_DIR / "theme_assignments_llm.json"
SIGNAL_LOG_JSONL = DATA_DIR / "paradigm_signal_log.jsonl"   # WS1-T7: append-only forward log
RUN_LOG_JSONL = DATA_DIR / "paradigm_run_log.jsonl"          # WS1-T7: append-only per-run summary

# ── Paradigm fields (exactly 12) ─────────────────────────────────────────
PARADIGM_FIELDS = [
    "pdm_themes",
    "pdm_theme_primary",
    "pdm_membership_score",
    "pdm_momentum_score",
    "pdm_economics_gate",
    "pdm_signal",
    "pdm_band",
    "pdm_rank",
    "pdm_confidence",
    "pdm_pro",
    "pdm_con",
    "pdm_flags",
]

# ── Momentum lookback windows and weights ────────────────────────────────
MOMENTUM_WINDOWS = {1: 0.10, 3: 0.20, 6: 0.30, 12: 0.40}

# ── Signal-relevant flag names (for pro/con when signal is None) ─────────
SIGNAL_FLAGS = {"no_reverse", "reverse_incomplete", "no_price_history", "insufficient_history"}


def empty_paradigm_result():
    """Return a paradigm object with all pdm_* fields set to null/empty."""
    return {
        "pdm_themes": [],
        "pdm_theme_primary": None,
        "pdm_membership_score": None,
        "pdm_momentum_score": None,
        "pdm_economics_gate": None,
        "pdm_signal": None,
        "pdm_band": None,
        "pdm_rank": None,
        "pdm_confidence": None,
        "pdm_pro": None,
        "pdm_con": None,
        "pdm_flags": [],
    }


def load_json(path):
    """Load a JSON file."""
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, payload):
    """Write a JSON file."""
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


def keyword_matches(keyword, text):
    """Check if keyword appears in text. Short keywords (<=4 chars) use word-boundary regex."""
    if len(keyword) <= 4:
        pattern = r"\b" + re.escape(keyword) + r"\b"
        return bool(re.search(pattern, text, re.IGNORECASE))
    else:
        return keyword.lower() in text


def build_seed_industry_lookup(themes):
    """Pre-compute: for each theme, map industry -> list of seed tickers in that industry."""
    lookup = {}
    for theme in themes:
        tid = theme["id"]
        seed_tickers = theme.get("member_rules", {}).get("seed_tickers", [])
        lookup[tid] = {"seed_tickers": seed_tickers, "industry_seeds": {}}
    return lookup


def resolve_seed_industries(lookup, stocks_by_symbol):
    """Populate industry_seeds: for each theme, map industry -> list of seed tickers."""
    for tid, info in lookup.items():
        industry_map = {}
        for sym in info["seed_tickers"]:
            stock = stocks_by_symbol.get(sym)
            if stock is None:
                continue
            ind = stock.get("industry")
            if ind and ind != "Unknown" and ind is not None:
                industry_map.setdefault(ind, []).append(sym)
        info["industry_seeds"] = industry_map


def compute_economics_gate(reverse_obj, config):
    """Compute pdm_economics_gate from reverse object using config thresholds.

    Returns (gate_value, flag) where gate_value is int 0-100 or None,
    and flag is a string to append to pdm_flags, or None.
    """
    if reverse_obj is None:
        return None, "no_reverse"

    quality = reverse_obj.get("rev_quality")
    survivability = reverse_obj.get("rev_survivability")

    if quality is None or survivability is None:
        return None, "reverse_incomplete"

    econ_config = config.get("economics_gate", {})
    quality_floor = econ_config.get("quality_floor", 50)
    survivability_floor = econ_config.get("survivability_floor", 50)

    q_norm = max(0, quality - quality_floor) / (100 - quality_floor)
    s_norm = max(0, survivability - survivability_floor) / (100 - survivability_floor)

    gate = round(q_norm * s_norm * 100)
    return gate, None


def compute_forward_bridge(reverse_obj, eps_trajectory_entry, stock, bridge_config):
    """Compute forward-EPS bridge for the economics gate (WS1-T8b).

    Returns (bridge_score, flag) where bridge_score is int 0-100 (capped at max_cap),
    and flag is the string to append if bridge > 0 / not applicable / etc.

    Precondition: rev_survivability >= survivability_precondition.
    If precondition not met OR no forward EPS data, returns (0, None).
    """
    if reverse_obj is None or eps_trajectory_entry is None:
        return 0, None

    survivability_precondition = bridge_config.get("survivability_precondition", 25)
    max_cap = bridge_config.get("max_cap", 35)
    w_growth = bridge_config.get("weight_eps_growth", 0.5)
    w_slope = bridge_config.get("weight_trajectory_slope", 0.5)

    survivability = reverse_obj.get("rev_survivability")
    if survivability is None or survivability < survivability_precondition:
        return 0, None

    # Forward EPS growth: compare forwardEpsEstimate to trailing eps
    # (eps_ttm is not directly in reverse object; use the next-quarter consensus from
    # the trajectory entry vs the current forwardEpsEstimate on the stock object as a
    # crude proxy — both are leading indicators)
    forward_eps = (stock or {}).get("forwardEpsEstimate")
    eps_ttm = None
    # Try to fish out a trailing EPS estimate from the stock-level fields
    if stock is not None:
        eps_ttm = stock.get("epsTrailingTwelveMonths") or stock.get("epsTTM")

    growth_norm = 0.5  # neutral when we can't compute it
    if forward_eps is not None and eps_ttm is not None:
        denom = max(abs(eps_ttm), 1.0)
        raw_growth = (forward_eps - eps_ttm) / denom
        clamped = max(-1.0, min(1.0, raw_growth))
        growth_norm = (clamped + 1.0) / 2.0  # rescale [-1, 1] -> [0, 1]

    slope = eps_trajectory_entry.get("trajectory_slope")
    if slope is not None and isinstance(slope, (int, float)) and math.isfinite(slope):
        clamped = max(-1.0, min(1.0, slope))
        slope_norm = (clamped + 1.0) / 2.0
    else:
        slope_norm = 0.5

    bridge_raw = round((w_growth * growth_norm + w_slope * slope_norm) * 100)
    bridge_capped = min(bridge_raw, max_cap)
    return bridge_capped, None  # caller decides if flag fires (depends on raw gate)


def compute_analyst_uplift(analyst_entry, has_themes, uplift_config):
    """Compute analyst-coverage uplift for the economics gate (WS1-T8c).

    Returns int 0..max_uplift.
    """
    if analyst_entry is None or not has_themes:
        return 0
    if uplift_config.get("require_theme_membership", True) and not has_themes:
        return 0

    max_uplift = uplift_config.get("max_uplift", 15)
    w_structured = uplift_config.get("structured_weight", 0.7)
    w_narrative = uplift_config.get("narrative_weight", 0.3)

    structured_score = analyst_entry.get("structured_score")
    narrative_score = analyst_entry.get("narrative_score")
    narrative_conf = analyst_entry.get("narrative_confidence") or 0.0

    s_norm = (structured_score / 100.0) if isinstance(structured_score, (int, float)) else 0.0
    n_norm = (narrative_score / 100.0 * narrative_conf) if isinstance(narrative_score, (int, float)) else 0.0

    uplift_raw = (w_structured * s_norm + w_narrative * n_norm) * max_uplift
    uplift = max(0, min(max_uplift, round(uplift_raw)))
    return uplift


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


def compute_percentile_rank(value, sorted_distribution, count):
    """Compute percentile rank of value within a sorted distribution.

    Uses the standard 'average rank for ties' definition:
    rank = (count of values < this) / (count - 1)  if count > 1, else 0.5
    """
    if count <= 1:
        return 0.5
    less_count = bisect.bisect_left(sorted_distribution, value)
    return less_count / (count - 1)


def compute_momentum_scores(price_history, stocks, momentum_config=None):
    """Compute pdm_momentum_score for each stock.

    WS1-T3b: static 4-window weighted percentile-rank composite.
    WS1-T8a: blends static composite (weight static_weight, default 0.6) with a
             Delta-percentile-rank acceleration component (weight accel_weight,
             default 0.4). Also flags accelerating / decelerating / regime_shift_*.

    Modifies the paradigm object on each stock in-place.
    Returns a dict of ticker -> momentum_score (int or None) for use in theme metrics.
    """
    if momentum_config is None:
        momentum_config = {}
    static_weight = momentum_config.get("static_weight", 0.6)
    accel_weight = momentum_config.get("accel_weight", 0.4)
    accelerating_threshold = momentum_config.get("accelerating_threshold", 70)
    decelerating_threshold = momentum_config.get("decelerating_threshold", 30)

    prices_dict = price_history.get("prices", {})

    # Step 1: Compute raw returns per window for every stock
    raw_returns = {}
    for stock in stocks:
        ticker = stock.get("symbol")
        if not ticker:
            continue
        if ticker not in prices_dict:
            raw_returns[ticker] = {}
            continue
        prices = prices_dict[ticker]
        if not isinstance(prices, list) or len(prices) < 2:
            raw_returns[ticker] = {}
            continue
        ticker_returns = {}
        for w in MOMENTUM_WINDOWS:
            ret = compute_raw_return(prices, w)
            if ret is not None:
                ticker_returns[w] = ret
        raw_returns[ticker] = ticker_returns

    # Step 2: Build sorted distributions per window across all stocks
    window_returns = {w: [] for w in MOMENTUM_WINDOWS}
    for ticker, returns in raw_returns.items():
        for w, ret in returns.items():
            window_returns[w].append(ret)

    sorted_distributions = {}
    window_counts = {}
    for w in MOMENTUM_WINDOWS:
        sorted_distributions[w] = sorted(window_returns[w])
        window_counts[w] = len(sorted_distributions[w])

    # Step 3: Compute per-stock per-window percentile ranks ONCE
    # ranks_by_ticker[ticker][window] = rank in [0, 1]
    ranks_by_ticker = {}
    for ticker, returns in raw_returns.items():
        ranks = {}
        for w, ret in returns.items():
            ranks[w] = compute_percentile_rank(ret, sorted_distributions[w], window_counts[w])
        ranks_by_ticker[ticker] = ranks

    # Step 4: Static weighted composite per stock
    static_scores = {}  # ticker -> float in [0, 1] or None
    for stock in stocks:
        ticker = stock.get("symbol")
        if not ticker:
            continue
        ranks = ranks_by_ticker.get(ticker, {})
        if not ranks:
            static_scores[ticker] = None
            continue
        available_windows = list(ranks.keys())
        total_weight = sum(MOMENTUM_WINDOWS[w] for w in available_windows)
        if total_weight == 0:
            static_scores[ticker] = None
            continue
        composite = 0.0
        for w in available_windows:
            composite += (MOMENTUM_WINDOWS[w] / total_weight) * ranks[w]
        static_scores[ticker] = composite

    # Step 5: Acceleration component (WS1-T8a)
    # Raw accel per ticker = rank_1m - rank_12m. Requires BOTH windows.
    raw_accels = {}  # ticker -> float in [-1, 1]
    for ticker, ranks in ranks_by_ticker.items():
        if 1 in ranks and 12 in ranks:
            raw_accels[ticker] = ranks[1] - ranks[12]

    # Re-rank raw_accels cross-sectionally to get accel_component in [0, 1]
    sorted_accels = sorted(raw_accels.values())
    accel_count = len(sorted_accels)
    accel_components = {}  # ticker -> float in [0, 1] or None
    for ticker in (s.get("symbol") for s in stocks):
        if ticker is None:
            continue
        if ticker in raw_accels:
            accel_components[ticker] = compute_percentile_rank(
                raw_accels[ticker], sorted_accels, accel_count
            )
        else:
            accel_components[ticker] = None

    # Step 6: Blend static + accel, write to paradigm, set flags
    momentum_scores = {}
    for stock in stocks:
        ticker = stock.get("symbol")
        if not ticker:
            continue

        paradigm = stock.get("paradigm", {})
        flags = paradigm.get("pdm_flags", [])

        if ticker not in prices_dict:
            paradigm["pdm_momentum_score"] = None
            if "no_price_history" not in flags:
                flags.append("no_price_history")
            momentum_scores[ticker] = None
            continue

        static = static_scores.get(ticker)
        if static is None:
            paradigm["pdm_momentum_score"] = None
            if "insufficient_history" not in flags:
                flags.append("insufficient_history")
            momentum_scores[ticker] = None
            continue

        accel = accel_components.get(ticker)
        if accel is not None:
            blended = static_weight * static + accel_weight * accel
            accel_score_100 = round(accel * 100)
            if accel_score_100 >= accelerating_threshold and "accelerating" not in flags:
                flags.append("accelerating")
            elif accel_score_100 <= decelerating_threshold and "decelerating" not in flags:
                flags.append("decelerating")
        else:
            # Static-only fallback (e.g., a newly-listed stock with < 13 closes)
            blended = static

        # Regime-shift booleans from 10-month MA on monthly closes
        prices = prices_dict.get(ticker, [])
        if isinstance(prices, list) and len(prices) >= 22:
            ma_10_now = sum(prices[-10:]) / 10.0
            # 10-month MA computed 12 months ago: mean(prices[-22:-12])
            ma_10_then = sum(prices[-22:-12]) / 10.0
            price_now = prices[-1]
            if price_now > ma_10_now and ma_10_now > ma_10_then and "regime_shift_up" not in flags:
                flags.append("regime_shift_up")
            elif price_now < ma_10_now and ma_10_now < ma_10_then and "regime_shift_down" not in flags:
                flags.append("regime_shift_down")

        score = round(blended * 100)
        paradigm["pdm_momentum_score"] = score
        momentum_scores[ticker] = score

    return momentum_scores


def compute_theme_metrics(price_history, stocks, themes, momentum_scores):
    """Compute per-theme metrics and write paradigm_theme_metrics.json.

    Returns a dict of theme_id -> metrics for the summary print.
    """
    prices_dict = price_history.get("prices", {})
    snapshot_date = price_history.get("snapshot_date", "unknown")

    # Build ticker -> paradigm lookup
    ticker_paradigm = {}
    for stock in stocks:
        sym = stock.get("symbol")
        if sym and "paradigm" in stock:
            ticker_paradigm[sym] = stock["paradigm"]

    theme_metrics = {}
    for theme in themes:
        tid = theme["id"]
        # Collect tagged members
        tagged_members = []
        for sym, paradigm in ticker_paradigm.items():
            if tid in paradigm.get("pdm_themes", []):
                tagged_members.append(sym)

        tagged_count = len(tagged_members)

        # Compute breadth and median momentum
        above_count = 0
        total_with_ma = 0
        momentum_vals = []

        for sym in tagged_members:
            prices = prices_dict.get(sym)
            if not isinstance(prices, list) or len(prices) < 11:
                continue
            total_with_ma += 1

            # 10-month MA
            ma_10 = sum(prices[-10:]) / 10.0
            if prices[-1] > ma_10:
                above_count += 1

            # Median momentum
            ms = momentum_scores.get(sym)
            if ms is not None:
                momentum_vals.append(ms)

        breadth_pct = round(above_count / total_with_ma * 100) if total_with_ma > 0 else None
        median_momentum = round(statistics.median(momentum_vals)) if momentum_vals else None

        theme_metrics[tid] = {
            "tagged_count": tagged_count,
            "tagged_with_history_count": total_with_ma,
            "median_momentum": median_momentum,
            "breadth_pct": breadth_pct,
        }

    # Write theme metrics file
    output = {
        "snapshot_date": snapshot_date,
        "computed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "themes": theme_metrics,
    }
    write_json(THEME_METRICS_JSON, output)

    return theme_metrics


def compute_signal(mem, mom, gate):
    """Compute pdm_signal as three-factor product.

    Returns int 0-100 or None if any factor is None.
    """
    if mem is None or mom is None or gate is None:
        return None
    return round((mem / 100.0) * (mom / 100.0) * (gate / 100.0) * 100)


def compute_band(signal, bands_config):
    """Determine pdm_band from signal value and bands config.

    bands_config is a dict like {"high": {"min_signal": 30, ...}, ...}
    """
    if signal is None:
        return "no_data"
    # Iterate bands in priority order (high -> mid -> watch -> skip)
    for band_name in ["high", "mid", "watch", "skip"]:
        band_def = bands_config.get(band_name, {})
        min_signal = band_def.get("min_signal", 0)
        if signal >= min_signal:
            return band_name
    return "skip"


def compute_rank(stocks):
    """Compute pdm_rank across the entire scored universe.

    Modifies paradigm objects in-place.
    """
    # Collect (symbol, signal) for stocks with non-null signal
    scored = []
    for stock in stocks:
        sym = stock.get("symbol")
        paradigm = stock.get("paradigm", {})
        signal = paradigm.get("pdm_signal")
        if sym and signal is not None:
            scored.append((sym, signal))

    # Sort by signal descending, then alphabetically by symbol for ties
    scored.sort(key=lambda x: (-x[1], x[0]))

    # Assign ranks
    rank_map = {}
    for idx, (sym, _) in enumerate(scored, start=1):
        rank_map[sym] = idx

    # Write back
    for stock in stocks:
        sym = stock.get("symbol")
        paradigm = stock.get("paradigm", {})
        if sym in rank_map:
            paradigm["pdm_rank"] = rank_map[sym]
        else:
            paradigm["pdm_rank"] = None


def build_pro_con(paradigm, bands_config):
    """Build pdm_pro and pdm_con for a single stock's paradigm object.

    Modifies paradigm in-place.
    """
    signal = paradigm.get("pdm_signal")
    mem = paradigm.get("pdm_membership_score")
    mom = paradigm.get("pdm_momentum_score")
    gate = paradigm.get("pdm_economics_gate")
    flags = paradigm.get("pdm_flags", [])
    themes = paradigm.get("pdm_themes", [])

    if signal is None:
        # Missing data case
        paradigm["pdm_pro"] = None
        relevant_flags = [f for f in flags if f in SIGNAL_FLAGS]
        if relevant_flags:
            paradigm["pdm_con"] = "Missing data: " + ", ".join(relevant_flags)
        else:
            paradigm["pdm_con"] = "Missing data: insufficient inputs"
        return

    # All three factors are non-null
    # Build pro from strongest pillar
    pillars = [
        ("gate", gate),
        ("mem", mem),
        ("mom", mom),
    ]
    # Sort by score descending; tie-break by preferred order (gate > mem > mom)
    # The pillars list already has gate first, then mem, then mom for tie-breaking
    pillars_sorted = sorted(pillars, key=lambda x: (-x[1], ["gate", "mem", "mom"].index(x[0])))

    strongest_name, strongest_score = pillars_sorted[0]
    weakest_name, weakest_score = pillars_sorted[-1]

    # ── Pro template ──
    if strongest_name == "gate":
        paradigm["pdm_pro"] = (
            f"Strong economics for the theme universe (quality+survivability gate {gate}/100)"
        )
    elif strongest_name == "mem":
        themes_joined = ", ".join(themes) if themes else "none"
        if "seed" in flags:
            paradigm["pdm_pro"] = (
                f"In secular theme(s) {themes_joined} (membership {mem}/100, includes seed)"
            )
        else:
            paradigm["pdm_pro"] = (
                f"In secular theme(s) {themes_joined} (membership {mem}/100)"
            )
    elif strongest_name == "mom":
        if mom >= 80:
            paradigm["pdm_pro"] = (
                f"Top-decile relative-strength momentum (mom {mom}/100) within the universe"
            )
        else:
            paradigm["pdm_pro"] = (
                f"Above-median momentum (mom {mom}/100) vs universe"
            )

    # ── Con template ──
    if gate == 0:
        paradigm["pdm_con"] = (
            "Economics gate is zero (quality or survivability below floor) - Nikola-style penalty"
        )
    elif 0 < gate < 25:
        paradigm["pdm_con"] = (
            f"Weak economics gate ({gate}/100) limits conviction"
        )
    elif mom is not None and mom < 30:
        paradigm["pdm_con"] = (
            f"Bottom-quartile momentum ({mom}/100) vs universe - market not validating yet"
        )
    elif mem is not None and mem == 67:
        paradigm["pdm_con"] = (
            f"Borderline theme membership ({mem}/100) - only two of three signals fired"
        )
    else:
        pillar_names = {"gate": "economics gate", "mem": "theme membership", "mom": "momentum"}
        paradigm["pdm_con"] = (
            f"Lowest pillar is {pillar_names[weakest_name]} ({weakest_score}/100)"
        )


def append_forward_log(stocks, themes, theme_metrics, macro_state, run_id, snapshot_date):
    """Append per-stock signal snapshot to JSONL log + per-run summary (WS1-T7).

    Append-only, never read back by scoring. Honest validation path: log signals
    now, observe outcomes later. One line per tagged stock per run.
    """
    # Per-stock log: only stocks with paradigm engagement (theme or signal or any pdm flag)
    log_lines = []
    for stock in stocks:
        p = stock.get("paradigm") or {}
        themes_list = p.get("pdm_themes") or []
        signal = p.get("pdm_signal")
        flags = p.get("pdm_flags") or []
        # Forward-log scope: stocks the system has an actionable view on.
        # Either tagged in a theme OR has a computed signal. Drops the bulk of
        # universe-noise (accel/regime flags on untagged stocks don't predict).
        if not themes_list and signal is None:
            continue
        rv = stock.get("reverse") or {}
        log_lines.append({
            "run_id": run_id,
            "snapshot_date": snapshot_date,
            "symbol": stock.get("symbol"),
            "name": stock.get("name"),
            "price": stock.get("price"),
            "pdm_themes": themes_list,
            "pdm_theme_primary": p.get("pdm_theme_primary"),
            "pdm_membership_score": p.get("pdm_membership_score"),
            "pdm_momentum_score": p.get("pdm_momentum_score"),
            "pdm_economics_gate": p.get("pdm_economics_gate"),
            "pdm_signal": signal,
            "pdm_band": p.get("pdm_band"),
            "pdm_rank": p.get("pdm_rank"),
            "pdm_flags": flags,
            "rev_quality": rv.get("rev_quality"),
            "rev_survivability": rv.get("rev_survivability"),
        })

    SIGNAL_LOG_JSONL.parent.mkdir(parents=True, exist_ok=True)
    with SIGNAL_LOG_JSONL.open("a", encoding="utf-8") as f:
        for line in log_lines:
            f.write(json.dumps(line, sort_keys=True) + "\n")

    # Per-run summary
    summary = {
        "run_id": run_id,
        "snapshot_date": snapshot_date,
        "stocks_total": len(stocks),
        "stocks_logged": len(log_lines),
        "themes_registered": len(themes),
        "macro_flags_global": (macro_state or {}).get("triggered_flags", []),
        "macro_fetched_at": (macro_state or {}).get("fetched_at"),
        "theme_metrics": theme_metrics,
    }
    with RUN_LOG_JSONL.open("a", encoding="utf-8") as f:
        f.write(json.dumps(summary, sort_keys=True) + "\n")

    return len(log_lines)


def main():
    # ── Load config, stocks, and reverse scores ──────────────────────────
    config = load_json(CONFIG_JSON)
    stocks = load_json(STOCKS_JSON)
    reverse_scores = load_json(REVERSE_SCORES_JSON) if REVERSE_SCORES_JSON.exists() else {}

    themes = config.get("themes", [])
    bands_config = config.get("bands", {})

    # ── Load price history (WS1-T3b) ─────────────────────────────────────
    if not PRICE_HISTORY_JSON.exists():
        print("ERROR: price_history.json not found at", PRICE_HISTORY_JSON)
        print("Run `python scripts/build_price_history.py` first.")
        return 1

    price_history = load_json(PRICE_HISTORY_JSON)

    # ── Optional: load overrides ─────────────────────────────────────────
    overrides = {}
    if OVERRIDES_JSON.exists():
        overrides = load_json(OVERRIDES_JSON)

    # ── Optional: load enriched sectors ──────────────────────────────────
    enriched_sectors = {}
    if SECTORS_ENRICHED_JSON.exists():
        enriched_sectors = load_json(SECTORS_ENRICHED_JSON)

    # ── Optional: load EPS trajectory (WS1-T8b) ──────────────────────────
    eps_trajectory = {}
    if EPS_TRAJECTORY_JSON.exists():
        eps_trajectory = load_json(EPS_TRAJECTORY_JSON)

    # ── Optional: load analyst coverage (WS1-T8c) ────────────────────────
    analyst_coverage = {}
    if ANALYST_COVERAGE_JSON.exists():
        analyst_coverage = load_json(ANALYST_COVERAGE_JSON)

    # ── Optional: load macro state (WS1-T9) ──────────────────────────────
    macro_state = {}
    macro_flags_global = []
    if MACRO_STATE_JSON.exists():
        macro_state = load_json(MACRO_STATE_JSON)
        macro_flags_global = macro_state.get("triggered_flags", [])

    # ── Optional: load LLM theme assignments (fallback classifier) ───────
    llm_theme_assignments = {}
    if THEME_LLM_JSON.exists():
        llm_theme_assignments = load_json(THEME_LLM_JSON)

    # ── Config blocks for T8a/T8b/T8c/T9 (graceful defaults if absent) ───
    momentum_config = config.get("momentum", {})
    forward_bridge_config = config.get("forward_bridge", {})
    analyst_bridge_config = config.get("analyst_bridge", {})
    macro_overlay_config = config.get("macro_overlay", {})

    # ── Dynamic per-theme composite threshold (T8a-dyn) ──────────────────
    # Read prior run's theme metrics (if any) -> drop threshold to
    # hot_composite_threshold for themes that were hot last run.
    default_threshold = momentum_config.get("default_composite_threshold", 2.0)
    hot_threshold = momentum_config.get("hot_composite_threshold", 1.5)
    hot_mom_floor = momentum_config.get("hot_median_mom", 70)
    hot_breadth_floor = momentum_config.get("hot_breadth_pct", 70)
    theme_thresholds = {t["id"]: default_threshold for t in themes}
    prior_metrics = {}
    if THEME_METRICS_JSON.exists():
        try:
            prior_metrics = load_json(THEME_METRICS_JSON).get("themes", {})
        except Exception:
            prior_metrics = {}
    hot_themes = []
    for t in themes:
        tid = t["id"]
        pm = prior_metrics.get(tid) or {}
        med = pm.get("median_momentum")
        br = pm.get("breadth_pct")
        if med is not None and br is not None and med >= hot_mom_floor and br >= hot_breadth_floor:
            theme_thresholds[tid] = hot_threshold
            hot_themes.append(tid)

    # ── Build stock lookup by symbol ─────────────────────────────────────
    stocks_by_symbol = {}
    for stock in stocks:
        sym = stock.get("symbol")
        if sym:
            stocks_by_symbol[sym] = stock

    # ── Pre-compute seed industry lookup ─────────────────────────────────
    seed_lookup = build_seed_industry_lookup(themes)
    resolve_seed_industries(seed_lookup, stocks_by_symbol)

    # ── Build paradigm scores keyed by ticker ────────────────────────────
    paradigm_scores = {}
    stocks_with_reverse = 0
    total_tagged = 0  # stocks with at least one theme (composite >= 2.0)
    theme_tag_counts = {t["id"]: 0 for t in themes}

    # Economics gate tracking
    gate_values = []

    for stock in stocks:
        ticker = stock.get("symbol")
        if not ticker:
            continue

        # Check if this stock has a reverse object (embedded or in sidecar)
        has_reverse = ("reverse" in stock and stock["reverse"] is not None) or (ticker in reverse_scores)
        if has_reverse:
            stocks_with_reverse += 1

        # ── Build matched text for keyword method ────────────────────────
        name = stock.get("name") or ""
        description = stock.get("description") or ""
        matched_text = (name + " " + description).lower()

        # ── Determine industry (with optional enrichment) ───────────────
        industry = stock.get("industry")
        use_enriched = False
        if (industry is None or industry == "Unknown") and ticker in enriched_sectors:
            enriched = enriched_sectors[ticker]
            enriched_ind = enriched.get("industry")
            if enriched_ind and enriched_ind != "Unknown":
                industry = enriched_ind
                use_enriched = True

        # ── Evaluate each theme ──────────────────────────────────────────
        result = empty_paradigm_result()
        theme_scores = {}  # theme_id -> composite_vote

        for theme in themes:
            tid = theme["id"]
            keywords = theme.get("keywords", [])
            negative_keywords = theme.get("negative_keywords", [])
            gics_industries = theme.get("member_rules", {}).get("gics_industries", [])
            seed_tickers = theme.get("member_rules", {}).get("seed_tickers", [])

            # Method 1: Keyword
            positive_hit = any(keyword_matches(kw, matched_text) for kw in keywords)
            negative_hit = any(keyword_matches(nkw, matched_text) for nkw in negative_keywords)

            if positive_hit and not negative_hit:
                vote_keyword = 1.0
            elif positive_hit and negative_hit:
                vote_keyword = 0.5
            else:
                vote_keyword = 0.0

            # Method 2: GICS industry
            vote_gics = 0.0
            if industry and industry != "Unknown":
                if industry in gics_industries:
                    vote_gics = 1.0

            # Method 3: Seed (with industry-adjacency propagation)
            vote_seed = 0.0
            flags = result["pdm_flags"]

            if ticker in seed_tickers:
                # Operator-curated seeds = explicit affirmation; vote 2.0 means
                # seed alone clears default threshold even when GICS + keyword
                # both fail (mega-caps with non-matching industry strings).
                vote_seed = 2.0
                flags.append("seed")
            else:
                # Adjacency rule: check if stock's industry matches industry of >=2 seed tickers
                if industry and industry != "Unknown":
                    industry_seeds = seed_lookup.get(tid, {}).get("industry_seeds", {})
                    seeds_in_industry = industry_seeds.get(industry, [])
                    if len(seeds_in_industry) >= 2:
                        vote_seed = 0.5
                        flags.append("seed_adjacent")

            # Composite (per-theme threshold from dynamic feedback loop)
            composite_vote = vote_keyword + vote_gics + vote_seed
            theme_scores[tid] = composite_vote

            tag_threshold = theme_thresholds.get(tid, default_threshold)
            if composite_vote >= tag_threshold:
                result["pdm_themes"].append(tid)
                theme_tag_counts[tid] = theme_tag_counts.get(tid, 0) + 1
                if tag_threshold < default_threshold and "hot_theme_expanded" not in flags:
                    flags.append("hot_theme_expanded")

        # ── LLM fallback: apply DeepSeek-classified themes when rule-based ──
        # composite failed to tag. LLM only fires when pdm_themes is empty
        # (i.e., no theme cleared the threshold via rules). Adds llm_tagged flag.
        if not result["pdm_themes"] and ticker in llm_theme_assignments:
            llm_entry = llm_theme_assignments[ticker]
            llm_themes = llm_entry.get("themes") or []
            llm_conf = llm_entry.get("confidence") or 0.0
            valid_theme_ids = {t["id"] for t in themes}
            llm_themes = [t for t in llm_themes if t in valid_theme_ids]
            if llm_themes and llm_conf >= 0.7:
                for llm_tid in llm_themes:
                    if llm_tid not in result["pdm_themes"]:
                        result["pdm_themes"].append(llm_tid)
                        theme_tag_counts[llm_tid] = theme_tag_counts.get(llm_tid, 0) + 1
                    # Synthetic composite vote for ranking (treat LLM as 1.5)
                    if llm_tid not in theme_scores:
                        theme_scores[llm_tid] = 1.5
                if "llm_tagged" not in flags:
                    flags.append("llm_tagged")

        # ── Sort pdm_themes by composite descending, then config order ───
        theme_order = {t["id"]: idx for idx, t in enumerate(themes)}
        result["pdm_themes"].sort(
            key=lambda tid: (-theme_scores[tid], theme_order.get(tid, 999))
        )

        # ── Set pdm_theme_primary and pdm_membership_score ───────────────
        if result["pdm_themes"]:
            primary_theme = result["pdm_themes"][0]
            primary_score = theme_scores[primary_theme]
            result["pdm_theme_primary"] = primary_theme
            result["pdm_membership_score"] = min(100, round((primary_score / 3.0) * 100))
            result["pdm_confidence"] = result["pdm_membership_score"]
            total_tagged += 1
        else:
            result["pdm_theme_primary"] = None
            result["pdm_membership_score"] = None
            result["pdm_confidence"] = None

        # ── Apply enriched_sector penalty ────────────────────────────────
        if use_enriched:
            if result["pdm_confidence"] is not None:
                result["pdm_confidence"] = round(result["pdm_confidence"] * 0.8)
            flags.append("enriched_sector")

        # ── Apply overrides ──────────────────────────────────────────────
        if ticker in overrides:
            override = overrides[ticker]
            override_theme = override.get("theme_primary")
            if override_theme:
                # Ensure override theme is in pdm_themes
                if override_theme not in result["pdm_themes"]:
                    result["pdm_themes"].insert(0, override_theme)
                result["pdm_theme_primary"] = override_theme
                flags.append("override")

        # ── Economics gate (WS1-T4) ──────────────────────────────────────
        # Source priority: embedded stock.reverse (when present) -> reverse_scores.json
        # (the canonical reverse-engine output). Remote scanner runs sometimes
        # write stocks.json WITHOUT embedded reverse, so the sidecar is the
        # reliable source.
        reverse_obj = stock.get("reverse")
        if reverse_obj is None and ticker in reverse_scores:
            reverse_obj = reverse_scores[ticker]
        raw_gate, gate_flag = compute_economics_gate(reverse_obj, config)
        if gate_flag is not None:
            flags.append(gate_flag)

        # ── Forward-EPS bridge (WS1-T8b) ─────────────────────────────────
        # Bridge requires reverse data (for survivability precondition) AND
        # trajectory data. If either is missing, bridge is 0.
        traj_entry = eps_trajectory.get(ticker) if eps_trajectory else None
        bridge_score, _ = compute_forward_bridge(
            reverse_obj, traj_entry, stock, forward_bridge_config
        )

        # Effective gate = max(raw_gate, bridge) when raw_gate is known;
        # when raw_gate is None but bridge is non-zero, use bridge as a floor.
        # Discipline: bridge only "saves" stocks whose survivability passes the
        # precondition, so this is safe to apply even when raw_gate is None
        # (means quality is missing but reverse is present and survivability is OK).
        if raw_gate is None and bridge_score == 0:
            effective_gate = None  # truly no gate info
        elif raw_gate is None:
            effective_gate = bridge_score
            if "gate_bridged_forward" not in flags:
                flags.append("gate_bridged_forward")
        else:
            effective_gate = max(raw_gate, bridge_score)
            if bridge_score > raw_gate and "gate_bridged_forward" not in flags:
                flags.append("gate_bridged_forward")

        # ── Analyst-coverage uplift (WS1-T8c) ────────────────────────────
        # Only applies to stocks that already have a theme membership (per
        # require_theme_membership in config). Uplift is capped (default 15).
        has_themes_now = bool(result["pdm_themes"])
        analyst_entry = analyst_coverage.get(ticker) if analyst_coverage else None
        uplift = compute_analyst_uplift(analyst_entry, has_themes_now, analyst_bridge_config)
        if uplift > 0:
            if effective_gate is None:
                effective_gate = uplift
            else:
                effective_gate = min(100, effective_gate + uplift)
            if "analyst_uplifted" not in flags:
                flags.append("analyst_uplifted")

        result["pdm_economics_gate"] = effective_gate
        if effective_gate is not None:
            gate_values.append(effective_gate)

        # ── Macro overlay flags (WS1-T9) ─────────────────────────────────
        # Apply only to stocks with theme membership (flag noise reduction).
        # Per option C: flags only, no signal multiplier. apply_multiplier
        # config key reserved for future hard-multiplier mode.
        if result["pdm_themes"] and macro_flags_global:
            for mf in macro_flags_global:
                if mf not in flags:
                    flags.append(mf)

        # ── Deduplicate flags ────────────────────────────────────────────
        # Keep order, remove duplicates
        seen_flags = set()
        deduped_flags = []
        for f in flags:
            if f not in seen_flags:
                seen_flags.add(f)
                deduped_flags.append(f)
        result["pdm_flags"] = deduped_flags

        # ── Attach paradigm object (additive) ────────────────────────────
        stock["paradigm"] = result

        # ── Build standalone entry keyed by ticker ───────────────────────
        paradigm_scores[ticker] = result

    # ── Compute momentum scores (WS1-T3b + WS1-T8a acceleration) ─────────
    momentum_scores = compute_momentum_scores(price_history, stocks, momentum_config)

    # ── Compute theme metrics (WS1-T3b) ──────────────────────────────────
    theme_metrics = compute_theme_metrics(price_history, stocks, themes, momentum_scores)

    # ── Compute signal, band, pro/con (WS1-T5) ───────────────────────────
    for stock in stocks:
        paradigm = stock.get("paradigm", {})
        mem = paradigm.get("pdm_membership_score")
        mom = paradigm.get("pdm_momentum_score")
        gate = paradigm.get("pdm_economics_gate")

        # Signal
        signal = compute_signal(mem, mom, gate)
        paradigm["pdm_signal"] = signal

        # Band
        paradigm["pdm_band"] = compute_band(signal, bands_config)

        # Pro/Con
        build_pro_con(paradigm, bands_config)

    # ── Compute rank (WS1-T5) ────────────────────────────────────────────
    compute_rank(stocks)

    # ── Write back to stocks.json ────────────────────────────────────────
    write_json(STOCKS_JSON, stocks)

    # ── Write standalone paradigm_scores.json ────────────────────────────
    write_json(PARADIGM_SCORES_JSON, paradigm_scores)

    # ── Summary ──────────────────────────────────────────────────────────
    print("=" * 60)
    print("  PARADIGM COMPOSITE TAGGER - Complete")
    print("=" * 60)
    print(f"  Stocks loaded:              {len(stocks)}")
    print(f"  Themes registered:          {len(themes)}")
    print(f"  Stocks with reverse object: {stocks_with_reverse}")
    print(f"  Stocks tagged (>=2.0):      {total_tagged}")
    print()
    print("  Per-theme tag counts:")
    for t in themes:
        tid = t["id"]
        label = t.get("label", tid)
        count = theme_tag_counts.get(tid, 0)
        print(f"    {tid:30s} ({label:40s}): {count:5d}")
    print()

    # Economics gate summary
    gate_count = len(gate_values)
    if gate_count > 0:
        sorted_gates = sorted(gate_values)
        median_gate = sorted_gates[gate_count // 2]
        print(f"  Economics gate: {gate_count} stocks with non-null gate, median={median_gate}")
    else:
        print(f"  Economics gate: 0 stocks with non-null gate")
    print()

    # Momentum summary
    scored_count = sum(1 for v in momentum_scores.values() if v is not None)
    scored_vals = [v for v in momentum_scores.values() if v is not None]
    if scored_vals:
        median_mom = statistics.median(scored_vals)
        print(f"  Momentum: {scored_count} stocks with non-null score, median={round(median_mom)}")
    else:
        print(f"  Momentum: 0 stocks with non-null score")
    print()

    # Per-theme metrics summary
    print("  Per-theme metrics:")
    for t in themes:
        tid = t["id"]
        m = theme_metrics.get(tid, {})
        breadth = m.get("breadth_pct", "N/A")
        median_mom = m.get("median_momentum", "N/A")
        print(f"    {tid:30s} breadth={breadth}% median_mom={median_mom}")
    print()

    # ── WS1-T5 summary: band counts ──────────────────────────────────────
    band_counts = Counter()
    no_data_count = 0
    for stock in stocks:
        paradigm = stock.get("paradigm", {})
        band = paradigm.get("pdm_band")
        band_counts[band] += 1
        if paradigm.get("pdm_signal") is None:
            no_data_count += 1

    print("  Band distribution:")
    for band_name in ["high", "mid", "watch", "skip", "no_data"]:
        cnt = band_counts.get(band_name, 0)
        print(f"    {band_name:10s} {cnt}")
    print(f"  (no_data count matches stocks with any factor None: {no_data_count})")
    print()

    # Top-10 by signal
    tagged_by_signal = [
        (stock.get("symbol"), stock.get("paradigm", {}))
        for stock in stocks
        if stock.get("paradigm", {}).get("pdm_signal") is not None
    ]
    tagged_by_signal.sort(key=lambda x: -x[1]["pdm_signal"])
    print("  Top-10 by signal:")
    for sym, p in tagged_by_signal[:10]:
        print(f"    {sym:6s} signal={p['pdm_signal']:3d} band={p['pdm_band']:6s} "
              f"primary_theme={p['pdm_theme_primary']}")
    print()

    # Theme-level signal medians
    theme_signal_vals = {t["id"]: [] for t in themes}
    for stock in stocks:
        paradigm = stock.get("paradigm", {})
        signal = paradigm.get("pdm_signal")
        if signal is not None:
            for tid in paradigm.get("pdm_themes", []):
                if tid in theme_signal_vals:
                    theme_signal_vals[tid].append(signal)
    print("  Theme-level signal medians:")
    for t in themes:
        tid = t["id"]
        vals = theme_signal_vals.get(tid, [])
        if vals:
            med = statistics.median(vals)
            print(f"    {tid:30s} median_signal={round(med):3d}  (n={len(vals)})")
        else:
            print(f"    {tid:30s} median_signal=N/A   (n=0)")
    print()

    # ── WS1-T8a/b/c flag counts ──────────────────────────────────────────
    flag_counts = Counter()
    for stock in stocks:
        for f in stock.get("paradigm", {}).get("pdm_flags") or []:
            flag_counts[f] += 1
    if hot_themes:
        print(f"  Dynamic threshold lowered ({hot_threshold}) for HOT themes: {hot_themes}")
        print(f"  All other themes use default threshold: {default_threshold}")
    else:
        print(f"  Composite threshold: {default_threshold} for all themes (no hot themes detected from prior run)")
    print()
    print("  WS1-T8/T9 flag counts:")
    for fn in ["accelerating", "decelerating", "regime_shift_up", "regime_shift_down",
               "gate_bridged_forward", "analyst_uplifted",
               "hot_theme_expanded", "llm_tagged",
               "macro_yield_warning", "macro_curve_inverted", "macro_ig_credit_stress",
               "macro_conditions_tight", "macro_hy_credit_stress"]:
        print(f"    {fn:25s} {flag_counts.get(fn, 0)}")
    eps_loaded = len(eps_trajectory)
    analyst_loaded = len(analyst_coverage)
    llm_loaded = len(llm_theme_assignments)
    macro_fetched_at = macro_state.get("fetched_at", "(not loaded)") if macro_state else "(not loaded)"
    print(f"  Sidecars: eps_trajectory={eps_loaded} tickers, "
          f"analyst_coverage={analyst_loaded} tickers, "
          f"theme_assignments_llm={llm_loaded} tickers, "
          f"macro_state={macro_fetched_at}")
    if macro_flags_global:
        print(f"  Macro signals active: {macro_flags_global}")
    print()

    print(f"  Written: stocks.json (additive paradigm object)")
    print(f"  Written: paradigm_scores.json ({len(paradigm_scores)} tickers)")
    print(f"  Written: paradigm_theme_metrics.json ({len(theme_metrics)} themes)")

    # ── WS1-T7: forward-logging hook ─────────────────────────────────────
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot_date = (price_history or {}).get("snapshot_date", run_id[:8])
    logged = append_forward_log(stocks, themes, theme_metrics, macro_state, run_id, snapshot_date)
    print(f"  Appended: paradigm_signal_log.jsonl ({logged} stock-rows, run_id={run_id})")
    print(f"  Appended: paradigm_run_log.jsonl (1 summary row)")
    print("=" * 60)


if __name__ == "__main__":
    main()
