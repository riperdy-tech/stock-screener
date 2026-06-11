import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STOCKS_JSON = DATA_DIR / "stocks.json"
FINANCIALS_DIR = DATA_DIR / "financials"
REVERSE_SCORES_JSON = DATA_DIR / "reverse_scores.json"
# Optional sidecar from build_fundamentals_history.py (SEC companyfacts):
# Piotroski F, Sloan accruals, real Beneish M, net share issuance.
FUNDAMENTALS_BATTERY_JSON = DATA_DIR / "fundamentals_battery.json"
CONFIG_JSON = Path(__file__).resolve().with_name("reverse_config.json")

REVERSE_FIELDS = [
    "rev_archetype",
    "rev_archetype_secondary",
    "rev_quality",
    "rev_mos",
    "rev_survivability",
    "rev_impairment_prob",
    "rev_cagr_proxy",
    "rev_drawdown_proxy",
    "rev_efficiency",
    "rev_composite",
    "rev_band",
    "rev_rank",
    "rev_flags",
    "rev_data_quality",
    "rev_pro",
    "rev_con",
    "rev_nominated",
    "rev_route_confidence",
    "growth_window",
]


def empty_reverse_result():
    return {field: None for field in REVERSE_FIELDS}


def load_json(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, payload):
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


def diagnostic_repr(value):
    return json.dumps(value, ensure_ascii=True)


def get_nested(data, *keys):
    current = data
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def as_number(value):
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float("inf"), float("-inf")) else None


def load_financial_detail(ticker):
    path = FINANCIALS_DIR / f"{ticker}.json"
    if not path.exists():
        return None
    return load_json(path)


def build_joined_record(stock, financial_detail):
    metrics = stock.get("metrics") or {}
    calculated = (financial_detail or {}).get("Calculated_Metrics") or {}

    return {
        "symbol": stock.get("symbol"),
        "name": stock.get("name"),
        "price": stock.get("price"),
        "marketCap": stock.get("marketCap"),
        "sector": stock.get("sector"),
        "industry": stock.get("industry"),
        "roic": metrics.get("roic"),
        "zScore": metrics.get("zScore"),
        "float": metrics.get("float"),
        "insiderOwnership": metrics.get("insiderOwnership"),
        "pegRatio": metrics.get("pegRatio"),
        "psRatio": metrics.get("psRatio"),
        "revenueGrowth": metrics.get("revenueGrowth"),
        "grossMargin": metrics.get("grossMargin"),
        "dilution": metrics.get("dilution"),
        "Enterprise_Value_EV": (financial_detail or {}).get("Enterprise_Value_EV"),
        "Free_Cash_Flow_TTM": (financial_detail or {}).get("Free_Cash_Flow_TTM"),
        "Total_Cash": (financial_detail or {}).get("Total_Cash"),
        "Total_Debt": (financial_detail or {}).get("Total_Debt"),
        "TTM_Revenue": calculated.get("TTM_Revenue"),
        "TTM_Gross_Margin_%": calculated.get("TTM_Gross_Margin_%"),
        "FCF_Margin_%": calculated.get("FCF_Margin_%"),
        "EV_to_Sales": calculated.get("EV_to_Sales"),
        "EV_to_EBIT": calculated.get("EV_to_EBIT"),
        "Core_Anchor_Multiple_0.4Sales_0.4GP": calculated.get(
            "Core_Anchor_Multiple_0.4Sales_0.4GP"
        ),
        "EPS_TTM": calculated.get("EPS_TTM"),
        "Forward_EPS_Estimate": calculated.get("Forward_EPS_Estimate"),
        "Price_to_Book": calculated.get("Price_to_Book"),
        "PE_5Y_Avg": calculated.get("PE_5Y_Avg"),
        "Monthly_Closes": (financial_detail or {}).get("Monthly_Closes"),
        "_financial_detail_present": financial_detail is not None,
    }


def compute_multi_year_revenue_cagr(annual_income_statement):
    """Compute multi-year revenue CAGR from annual income statement rows.

    Newest-first: rev[0] is most recent year, rev[1] is prior year, etc.
    Guard: any denominator rev <= 0 or None → falls back one tier.
    Returns (cagr_pct, growth_window) or (None, "1yr") for fallback.
    """
    annual = annual_income_statement or []
    revenues = []
    for row in annual:
        if not isinstance(row, dict):
            break
        rev = as_number(row.get("TotalRevenue"))
        if rev is None or rev <= 0:
            break
        revenues.append(rev)

    # Try 4-period true 3yr CAGR: (rev[0]/rev[3])**(1/3) - 1
    if len(revenues) >= 4:
        if revenues[3] is not None and revenues[3] > 0:
            cagr = ((revenues[0] / revenues[3]) ** (1.0 / 3.0) - 1) * 100
            return round(cagr, 2), "3yr"

    # Fall back to 3-period 2yr CAGR: (rev[0]/rev[2])**(1/2) - 1
    if len(revenues) >= 3:
        if revenues[2] is not None and revenues[2] > 0:
            cagr = ((revenues[0] / revenues[2]) ** (1.0 / 2.0) - 1) * 100
            return round(cagr, 2), "2yr"

    # Insufficient data — caller falls back to 1yr YoY
    return None, "1yr"


def latest_ebit_proxy(financial_detail):
    annual = (financial_detail or {}).get("Annual_Income_Statement") or []
    if not annual or not isinstance(annual[0], dict):
        return None
    return as_number(annual[0].get("OperatingIncome"))


def latest_ebitda(financial_detail):
    calculated = (financial_detail or {}).get("Calculated_Metrics") or {}
    return as_number(calculated.get("EBITDA"))


def leverage_denominator(financial_detail):
    ebitda = latest_ebitda(financial_detail)
    if ebitda is not None and ebitda > 0:
        return ebitda, "EBITDA"
    ebit_proxy = latest_ebit_proxy(financial_detail)
    if ebit_proxy is not None and ebit_proxy > 0:
        return ebit_proxy, "EBIT proxy"
    return None, None


def calculate_data_quality(stock, financial_detail, archetype=None):
    metrics = stock.get("metrics") or {}
    score = 5

    if financial_detail is None:
        score -= 1

    total_debt = as_number((financial_detail or {}).get("Total_Debt"))
    total_cash = as_number((financial_detail or {}).get("Total_Cash"))
    if total_debt is None or total_cash is None:
        score -= 1

    denominator, _ = leverage_denominator(financial_detail)
    if (denominator is None or denominator <= 0) and archetype not in ("G", "H"):
        score -= 1

    fcf = as_number((financial_detail or {}).get("Free_Cash_Flow_TTM"))
    if fcf is None:
        score -= 1

    if stock.get("sector") == "Unknown" or stock.get("industry") == "Unknown":
        score -= 1

    # Keep a direct reference to metrics so future phases can extend this without changing callers.
    metrics.get("zScore")
    return max(score, 0)


def is_missing_required(value):
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    return False


def detect_etf_or_fund(stock):
    name = str(stock.get("name") or "").lower()
    sector = str(stock.get("sector") or "").lower()
    return "etf" in name or "fund" in name or "etf" in sector or "fund" in sector


def stage0_exclusion_reasons(stock, thresholds):
    reasons = []
    market_cap = as_number(stock.get("marketCap"))
    price = as_number(stock.get("price"))
    sector = stock.get("sector")

    if market_cap is None or market_cap <= 0:
        reasons.append("missing marketCap")
    elif market_cap < thresholds["min_market_cap"]:
        reasons.append(f"marketCap below {thresholds['min_market_cap']}")

    if is_missing_required(sector):
        reasons.append("missing sector")
    if price is None or price <= 0:
        reasons.append("missing price")

    if detect_etf_or_fund(stock):
        reasons.append("identified ETF/fund")

    return reasons


def stage1_eliminators(stock, financial_detail, data_quality, thresholds):
    metrics = stock.get("metrics") or {}
    rejects = []
    flags = []
    notes = []

    z_score = as_number(metrics.get("zScore"))
    # Sector-aware Z-score threshold: asset-light sectors use lower boundaries, Financials/REITs exempt
    sector = stock.get("sector") or "Unknown"
    sector_z_map = thresholds.get("sector_altman_z_min") or {}
    z_min = sector_z_map.get(sector, thresholds.get("altman_z_min", 1.8))
    if z_score is not None and z_score < z_min:
        rejects.append(f"bankruptcy risk: zScore {z_score:.2f} < {z_min} (sector {sector})")

    total_debt = as_number((financial_detail or {}).get("Total_Debt"))
    total_cash = as_number((financial_detail or {}).get("Total_Cash"))
    denominator, denominator_label = leverage_denominator(financial_detail)
    if total_debt is None or total_cash is None:
        flags.append("leverage_data_missing")
        notes.append("Leverage test skipped: Total_Debt/Total_Cash missing")
    elif denominator is None or denominator <= 0:
        flags.append("leverage_denominator_unusable")
        notes.append("Leverage test skipped: EBITDA missing and EBIT proxy <= 0 or null")
    else:
        net_debt_to_denominator = (total_debt - total_cash) / denominator
        if denominator_label == "EBITDA":
            flags.append("real_ebitda_used")
        else:
            flags.append("ebit_used_as_ebitda_proxy")
            notes.append("EBIT used as EBITDA fallback where real EBITDA is null")
        if net_debt_to_denominator > thresholds["net_debt_to_ebitda_max"]:
            rejects.append(
                f"leverage: net debt / {denominator_label} "
                f"{net_debt_to_denominator:.2f} > {thresholds['net_debt_to_ebitda_max']}"
            )

    fcf = as_number((financial_detail or {}).get("Free_Cash_Flow_TTM"))
    if fcf is not None and fcf < 0:
        flags.append("negative_fcf_ttm")
        notes.append("Negative FCF TTM is a soft flag; multi-year cash-burn test deferred")

    if data_quality < 2:
        rejects.append(f"data quality: {data_quality} < 2")

    notes.append("Dilution eliminator deferred to Phase 6; current metrics.dilution is unreliable")
    notes.append("Archetype suspensions applied only for G/H leverage-only rejects in Phase 3")
    return rejects, flags, notes


def append_note(existing, note):
    if not note:
        return existing
    if not existing:
        return note
    if note in existing:
        return existing
    return f"{existing}; {note}"


def _is_internal_caveat(note):
    """True if note is an engine-internal caveat, not a real investment concern."""
    internal_patterns = [
        "haircuts omitted",
        "inputs unavailable",
        "deferred to Phase",
        "Phase 6",
        "Phase 3",
        "v3.2 required",
        "metrics.dilution is unreliable",
        "metrics.dilution unreliable",
        "true EBITDA history unavailable",
        "EBIT proxy; true EBITDA",
        "EBIT used as EBITDA fallback",
        "dilution drag omitted",
        "drawdown leverage adjustment skipped",
        "protected: drawdown",
        "Beta missing; sector-median beta fallback",
        "survivability customer/counterparty",
        "limited survivability customer",
        "limited survivability dilution",
        "Archetype suspensions applied",
        "Dilution eliminator deferred",
        "forward EPS secondary contribution",
        "dilution drag omitted from CAGR",
        "EV/EBIT uses EBIT proxy",
        "EBIT used as EBITDA fallback",
        "MoS unavailable: no positive FCF",
        "Negative FCF caps MoS",
        "No positive FCF; FCF-yield",
    ]
    note_lower = note.lower()
    return any(pattern.lower() in note_lower for pattern in internal_patterns)


def clean_rev_con(existing_con, reverse_result):
    """Remove internal caveats from rev_con. Fall back to strongest genuine concern or neutral."""
    if not existing_con:
        return _fallback_concern(reverse_result)

    notes = [n.strip() for n in existing_con.split(";") if n.strip()]
    kept = [n for n in notes if not _is_internal_caveat(n)]

    if not kept:
        return _fallback_concern(reverse_result)

    # Deduplicate near-duplicates
    deduped = []
    for n in kept:
        if not any(n.lower() in d.lower() or d.lower() in n.lower() for d in deduped):
            deduped.append(n)

    return "; ".join(deduped)  # all real concerns, no internal noise


def _fallback_concern(reverse_result):
    """Return the strongest genuine concern from scores, or a clean neutral."""
    dq = reverse_result.get("rev_data_quality") or 0
    imp = reverse_result.get("rev_impairment_prob") or 0
    surv = reverse_result.get("rev_survivability") or 0
    mos = reverse_result.get("rev_mos") or 0
    flags = (reverse_result.get("rev_flags") or "").lower()

    if dq <= 1:
        return "Very sparse financial data — scores carry high uncertainty"
    if imp > 0.20:
        return f"Elevated impairment risk ({imp:.0%}) — balance-sheet stress possible"
    if surv < 40:
        return "Low survivability score — funding or leverage stress"
    if mos < 30:
        return "Limited margin of safety — valuation premium"
    if "high_growth_unverified" in flags:
        return "Revenue growth exceeds base-rate ceiling — elevated expectations"
    if dq < 3:
        return "Some data gaps — due diligence recommended"
    return "No major concern flagged at triage"


def clean_rev_pro(mos_reason, route_reason):
    """Build a clean, deduplicated rev_pro (thesis) sentence from available signals."""
    if not mos_reason and not route_reason:
        return "Composite score driven by balanced fundamentals"
    if not mos_reason:
        return _clean_route_reason(route_reason)
    if not route_reason:
        return mos_reason

    # Check for significant term overlap (e.g. both mention "FCF yield")
    mos_words = set(w.lower().strip(".,;:()%") for w in mos_reason.split())
    route_words = set(w.lower().strip(".,;:()%") for w in route_reason.split())
    stop = {"a", "the", "is", "and", "or", "in", "of", "to", "for", "with", "at", "by", "on", "+", "-", ""}
    overlap = mos_words & route_words - stop

    if len(overlap) >= 2:
        # Significant overlap — use the more specific (MoS) reason alone
        return mos_reason
    return f"{mos_reason} + {_clean_route_reason(route_reason)}"


def _clean_route_reason(reason):
    """Shorten verbose route reasons to clean phrases."""
    # Map common verbose route reasons to concise labels
    mappings = {
        "Positive FCF, ROIC above WACC+5, and revenue growth > 8%": "high ROIC and revenue growth",
        "Positive FCF but below quality-compounder growth/ROIC bar": "positive FCF, moderate growth profile",
        "Negative FCF; weak option-led/unprofitable shape": "negative FCF, early-stage profile",
        "Ambiguous financial shape; conservative stable-incumbent default": "conservative stable-incumbent profile",
        "Pre-revenue/negative-gross-margin option-led shape": "pre-revenue, option-led profile",
        "Healthcare with near-zero revenue; noisy binary/regulatory proxy": "healthcare binary/regulatory profile",
        "Industry keyword route": "",
        "sector": "",
    }
    for verbose, concise in mappings.items():
        if verbose in reason:
            return concise
    return reason


def latest_annual_income(financial_detail, field_name):
    annual = (financial_detail or {}).get("Annual_Income_Statement") or []
    if not annual or not isinstance(annual[0], dict):
        return None
    return as_number(annual[0].get(field_name))


def match_industry_keyword(industry, archetype_map):
    if not industry or industry == "Unknown":
        return None
    industry_lower = industry.lower()
    for archetype, keywords in (archetype_map.get("industry_keywords") or {}).items():
        for keyword in keywords:
            if keyword.lower() in industry_lower:
                return archetype
    return None


def get_sector_wacc(sector, config):
    return as_number((config.get("sector_wacc") or {}).get(sector)) or 10.0


def route_archetype(stock, financial_detail, config):
    sector = stock.get("sector")
    industry = stock.get("industry")
    metrics = stock.get("metrics") or {}
    calculated = (financial_detail or {}).get("Calculated_Metrics") or {}
    archetype_map = config.get("archetype_map") or {}

    industry_match = match_industry_keyword(industry, archetype_map)
    if industry_match:
        return industry_match, "high", f"Industry keyword route: {industry}"

    has_real_industry = industry is not None and industry != "Unknown"

    if sector == "Financial Services" and not has_real_industry:
        return "G", "high", "Financial Services sector"
    if sector in ("Real Estate", "Utilities") and not has_real_industry:
        return "H", "high", f"{sector} sector"
    if detect_etf_or_fund(stock):
        return "I", "high", "ETF/fund name or sector"

    ttm_revenue = as_number(calculated.get("TTM_Revenue"))
    gross_margin = as_number(calculated.get("TTM_Gross_Margin_%"))
    if (ttm_revenue is None or abs(ttm_revenue) <= 1) and gross_margin is not None and gross_margin <= 0:
        return "E", "medium", "Pre-revenue/negative-gross-margin option-led shape"

    if sector == "Healthcare" and (ttm_revenue is None or abs(ttm_revenue) <= 1):
        return "F", "low", "Healthcare with near-zero revenue; noisy binary/regulatory proxy"

    if sector in ("Energy", "Materials", "Basic Materials"):
        return "C", "medium", f"{sector} sector-level cyclical route"

    fcf = as_number((financial_detail or {}).get("Free_Cash_Flow_TTM"))
    # Phase 6.1c: real multi-year CAGR with 1yr YoY fallback
    multi_yr_cagr, growth_window = compute_multi_year_revenue_cagr(
        (financial_detail or {}).get("Annual_Income_Statement")
    )
    revenue_growth = multi_yr_cagr if multi_yr_cagr is not None else as_number(calculated.get("YoY_Revenue_Growth_%"))
    roic = as_number(metrics.get("roic"))
    wacc = get_sector_wacc(sector, config)

    if fcf is not None and fcf > 0:
        roic_pct = roic * 100 if roic is not None else None
        if (
            roic_pct is not None
            and revenue_growth is not None
            and gross_margin is not None
            and gross_margin > 0
            and roic_pct > wacc + 5
            and revenue_growth > 8
        ):
            confidence = "high" if has_real_industry else "medium"
            return "B", confidence, "Positive FCF, ROIC above WACC+5, and revenue growth > 8%"
        confidence = "high" if has_real_industry else "medium"
        return "A", confidence, "Positive FCF but below quality-compounder growth/ROIC bar"

    if fcf is not None and fcf <= 0:
        confidence = "high" if has_real_industry else "low"
        return "E", confidence, "Negative FCF; weak option-led/unprofitable shape"

    return "A", "low", "Ambiguous financial shape; conservative stable-incumbent default"


def is_leverage_only_reject(reverse_result):
    reason = reverse_result.get("rev_con") or ""
    return reason.startswith("leverage:") and "bankruptcy risk:" not in reason and "data quality:" not in reason


def apply_leverage_suspension(stock, financial_detail, reverse_result, config):
    if reverse_result.get("rev_band") != "Reject" or not is_leverage_only_reject(reverse_result):
        return False

    archetype, confidence, route_reason = route_archetype(stock, financial_detail, config)
    if archetype not in ("G", "H"):
        return False

    reverse_result["rev_band"] = None
    reverse_result["rev_archetype"] = archetype
    reverse_result["rev_archetype_secondary"] = None
    reverse_result["rev_route_confidence"] = confidence
    reverse_result["rev_con"] = append_note(
        reverse_result.get("rev_con"),
        f"{archetype} suspension: leverage eliminator waived; {route_reason}",
    )
    return True


def score_by_threshold(value, bands, default_score=0):
    number = as_number(value)
    if number is None:
        return None
    for band in bands:
        if "gt" in band and number > band["gt"]:
            return band["score"]
        if "gte" in band and number >= band["gte"]:
            return band["score"]
        if "lt" in band and number < band["lt"]:
            return band["score"]
        if "lte" in band and number <= band["lte"]:
            return band["score"]
    return default_score


def score_by_percentile_band(value, band_config):
    number = as_number(value)
    if number is None:
        return None

    anchors = sorted(band_config["anchors"], key=lambda item: item["value"])
    if band_config.get("direction") == "higher_is_better":
        if number <= anchors[0]["value"]:
            return anchors[0]["score"]
        if number >= anchors[-1]["value"]:
            return 100 if number > anchors[-1]["value"] else anchors[-1]["score"]
        for low, high in zip(anchors, anchors[1:]):
            if low["value"] <= number <= high["value"]:
                span = high["value"] - low["value"]
                if span <= 0:
                    return high["score"]
                ratio = (number - low["value"]) / span
                return low["score"] + ratio * (high["score"] - low["score"])

    descending = sorted(band_config["anchors"], key=lambda item: item["value"], reverse=True)
    if number >= descending[0]["value"]:
        return descending[0]["score"]
    if number <= descending[-1]["value"]:
        return 100 if number < descending[-1]["value"] else descending[-1]["score"]
    for high_value_anchor, low_value_anchor in zip(descending, descending[1:]):
        if low_value_anchor["value"] <= number <= high_value_anchor["value"]:
            span = high_value_anchor["value"] - low_value_anchor["value"]
            if span <= 0:
                return low_value_anchor["score"]
            ratio = (high_value_anchor["value"] - number) / span
            return high_value_anchor["score"] + ratio * (
                low_value_anchor["score"] - high_value_anchor["score"]
            )
    return None


def annual_operating_margin(financial_detail):
    revenue = latest_annual_income(financial_detail, "TotalRevenue")
    operating_income = latest_annual_income(financial_detail, "OperatingIncome")
    if revenue is None or revenue <= 0 or operating_income is None:
        return None
    return (operating_income / revenue) * 100


def runway_months(financial_detail):
    total_cash = as_number((financial_detail or {}).get("Total_Cash"))
    fcf = as_number((financial_detail or {}).get("Free_Cash_Flow_TTM"))
    if total_cash is None or fcf is None:
        return None
    if fcf >= 0:
        return float("inf")
    monthly_burn = abs(fcf) / 12
    if monthly_burn <= 0:
        return None
    return total_cash / monthly_burn


def max_drawdown_pct(values):
    closes = [as_number(value) for value in values or []]
    closes = [value for value in closes if value is not None and value > 0]
    if len(closes) < 6:
        return None

    peak = closes[0]
    max_drawdown = 0.0
    for close in closes:
        if close > peak:
            peak = close
        drawdown = (peak - close) / peak
        if drawdown > max_drawdown:
            max_drawdown = drawdown
    return max_drawdown * 100


def net_debt_to_earnings_denominator(financial_detail):
    total_debt = as_number((financial_detail or {}).get("Total_Debt"))
    total_cash = as_number((financial_detail or {}).get("Total_Cash"))
    denominator, denominator_label = leverage_denominator(financial_detail)
    if total_debt is None or total_cash is None:
        return None, None
    net_debt = total_debt - total_cash
    if net_debt <= 0:
        return "net_cash", denominator_label
    if denominator is None or denominator <= 0:
        return None, None
    return net_debt / denominator, denominator_label


def has_usable_earnings_denominator(financial_detail):
    denominator, _ = leverage_denominator(financial_detail)
    return denominator is not None and denominator > 0


def limited_dimension(context, name, reason):
    context["limited_count"] += 1
    context["data_quality"] = max(context["data_quality"] - 1, 0)
    context["limited_notes"].append(f"limited {name}: {reason}")
    return context["limited_score"]


def score_ab_quality(stock, financial_detail, config, context):
    metrics = stock.get("metrics") or {}
    calculated = (financial_detail or {}).get("Calculated_Metrics") or {}
    rubric = config["quality_rubrics"]["ab"]
    sector = stock.get("sector")
    wacc = get_sector_wacc(sector, config)

    roic = as_number(metrics.get("roic"))
    if roic is None:
        returns = limited_dimension(context, "returns on capital", "ROIC missing")
    else:
        returns = score_by_threshold((roic * 100) - wacc, rubric["roic_spread"], 0)

    growth = as_number(calculated.get("YoY_Revenue_Growth_%"))
    # Phase 6.1c: prefer real multi-year CAGR over 1yr YoY for growth-quality scoring
    multi_yr_cagr, _ = compute_multi_year_revenue_cagr(
        (financial_detail or {}).get("Annual_Income_Statement")
    )
    quality_growth = multi_yr_cagr if multi_yr_cagr is not None else growth
    if quality_growth is None:
        growth_score = limited_dimension(context, "growth quality", "YoY_Revenue_Growth_% missing")
    else:
        growth_score = score_by_threshold(quality_growth, rubric["growth_pct"], 0)

    fcf_margin = as_number(calculated.get("FCF_Margin_%"))
    if fcf_margin is None:
        cash_score = limited_dimension(context, "cash generation", "FCF_Margin_% missing")
    else:
        cash_score = score_by_threshold(fcf_margin, rubric["fcf_margin_pct"], 0)

    if not has_usable_earnings_denominator(financial_detail):
        balance = limited_dimension(context, "balance sheet", "EBITDA and EBIT proxy missing/unusable")
        return returns + growth_score + cash_score + balance

    leverage, denominator_label = net_debt_to_earnings_denominator(financial_detail)
    if leverage == "net_cash":
        balance = rubric["net_cash_score"]
    elif leverage is None:
        balance = limited_dimension(context, "balance sheet", "EBITDA/EBIT proxy or cash/debt missing")
    else:
        balance = score_by_threshold(leverage, rubric["net_debt_to_ebit"], 0)
        if denominator_label == "EBITDA":
            context["quality_notes"].append("balance sheet uses real EBITDA")
        else:
            context["quality_notes"].append("balance sheet uses EBIT proxy fallback because EBITDA is null")

    return returns + growth_score + cash_score + balance


def score_c_quality(financial_detail, config, context):
    rubric = config["quality_rubrics"]["c"]
    margin = annual_operating_margin(financial_detail)
    if margin is None:
        profitability = limited_dimension(context, "mid-cycle profitability", "OperatingIncome margin missing")
    else:
        profitability = score_by_threshold(margin, rubric["operating_margin_pct"], 0)
        context["quality_notes"].append("mid-cycle profitability uses latest OperatingIncome margin proxy; no 10-year cycle history")

    capital = limited_dimension(context, "capital discipline", "capex history not persisted")
    resilience = limited_dimension(context, "cycle resilience", "full-cycle drawdown unavailable until Phase 7")
    cost_position = limited_dimension(context, "cost position", "cost-position data unavailable")
    return profitability + capital + resilience + cost_position


def score_e_quality(financial_detail, config, context):
    rubric = config["quality_rubrics"]["e"]
    calculated = (financial_detail or {}).get("Calculated_Metrics") or {}
    revenue = as_number(calculated.get("TTM_Revenue"))
    if revenue is None:
        commercial = limited_dimension(context, "commercial evidence", "TTM_Revenue missing")
    else:
        commercial = score_by_threshold(revenue, rubric["revenue"], 5)

    path_to_fcf = limited_dimension(context, "path to FCF", "runway/path data unavailable until Phase 6")

    months = runway_months(financial_detail)
    if months is None:
        funding = limited_dimension(context, "funding runway", "Total_Cash or FCF burn missing")
    elif months == float("inf"):
        funding = 25
    else:
        funding = score_by_threshold(months, rubric["runway_months"], 0)

    dilution = limited_dimension(context, "dilution discipline", "metrics.dilution is unreliable until Phase 6")
    return commercial + path_to_fcf + funding + dilution


def score_f_quality(financial_detail, config, context):
    evidence = limited_dimension(context, "event evidence", "binary/regulatory milestone data unavailable")
    probability = limited_dimension(context, "probability base rate", "trial/regulatory probability data unavailable")
    months = runway_months(financial_detail)
    if months is None:
        funding = limited_dimension(context, "funding runway", "Total_Cash or FCF burn missing")
    elif months == float("inf"):
        funding = 25
    else:
        funding = score_by_threshold(months, config["quality_rubrics"]["e"]["runway_months"], 0)
    dilution = limited_dimension(context, "dilution discipline", "metrics.dilution is unreliable until Phase 6")
    context["quality_notes"].append("F quality is heavily limited; v3.2 must verify binary/regulatory evidence")
    return evidence + probability + funding + dilution


def score_g_quality(stock, config, context):
    metrics = stock.get("metrics") or {}
    rubric = config["quality_rubrics"]["g"]
    roic = as_number(metrics.get("roic"))
    wacc = get_sector_wacc(stock.get("sector"), config)
    if roic is None:
        returns = limited_dimension(context, "returns", "ROIC missing and ROE unavailable")
    else:
        returns = score_by_threshold((roic * 100) - wacc, rubric["roic_spread"], 5)
        context["quality_notes"].append("G returns use ROIC as ROE proxy; ROIC is not bank ROE")
    credit = limited_dimension(context, "credit quality", "NPL data unavailable")
    capital = limited_dimension(context, "capital", "CET1 data unavailable")
    funding = limited_dimension(context, "funding", "deposit/LCR data unavailable")
    context["data_quality"] = min(context["data_quality"], 3)
    context["quality_notes"].append("G quality is shallow; v3.2 must verify capital and credit")
    return returns + credit + capital + funding


def score_h_quality(financial_detail, config, context):
    distribution = limited_dimension(context, "distribution safety", "AFFO/payout data unavailable until Phase 6")
    asset_quality = limited_dimension(context, "asset quality", "occupancy/utilization data unavailable")
    leverage, denominator_label = net_debt_to_earnings_denominator(financial_detail)
    if leverage == "net_cash":
        debt = 15
    elif leverage is None:
        debt = config["quality_rubrics"].get("limited_score", 10)
        context["quality_notes"].append("H debt structure limited: EBITDA/EBIT unavailable; null EBITDA not penalized for H")
    else:
        debt = score_by_threshold(leverage, config["quality_rubrics"]["h"]["net_debt_to_ebit"], 5)
        if denominator_label == "EBITDA":
            context["quality_notes"].append("H debt structure uses real EBITDA where available; AFFO unavailable")
        else:
            context["quality_notes"].append("H debt structure uses EBIT proxy fallback; AFFO unavailable")
    rates = limited_dimension(context, "rate sensitivity", "rate sensitivity data unavailable")
    context["data_quality"] = min(context["data_quality"], 3)
    context["quality_notes"].append("H quality is shallow; v3.2 must verify AFFO/assets/debt ladder")
    return distribution + asset_quality + debt + rates


def score_i_quality(context):
    liquidity = limited_dimension(context, "ETF liquidity", "ETF liquidity data unavailable")
    fees = limited_dimension(context, "expense ratio", "expense data unavailable")
    tracking = limited_dimension(context, "tracking quality", "tracking error data unavailable")
    holdings = limited_dimension(context, "holdings quality", "holdings data unavailable")
    return liquidity + fees + tracking + holdings


def apply_quality_score(stock, financial_detail, reverse_result, config):
    context = {
        "data_quality": reverse_result.get("rev_data_quality") or 0,
        "limited_score": config["quality_rubrics"].get("limited_score", 10),
        "limited_count": 0,
        "limited_notes": [],
        "quality_notes": [],
    }
    archetype = reverse_result.get("rev_archetype")

    if archetype in ("A", "B"):
        quality = score_ab_quality(stock, financial_detail, config, context)
    elif archetype == "C":
        quality = score_c_quality(financial_detail, config, context)
    elif archetype == "E":
        quality = score_e_quality(financial_detail, config, context)
    elif archetype == "F":
        quality = score_f_quality(financial_detail, config, context)
    elif archetype == "G":
        quality = score_g_quality(stock, config, context)
    elif archetype == "H":
        quality = score_h_quality(financial_detail, config, context)
    elif archetype == "I":
        quality = score_i_quality(context)
    else:
        raise RuntimeError(f"Unsupported archetype for quality scoring: {archetype}")

    if reverse_result.get("rev_route_confidence") == "low":
        context["data_quality"] = max(context["data_quality"] - 1, 0)
        context["quality_notes"].append("low route confidence")

    reverse_result["rev_quality"] = max(0, min(100, quality))
    if context["limited_count"] > 0:
        reverse_result["rev_quality"] = min(reverse_result["rev_quality"], 85)
    reverse_result["rev_data_quality"] = max(0, min(5, context["data_quality"]))
    for note in context["limited_notes"] + context["quality_notes"]:
        reverse_result["rev_con"] = append_note(reverse_result.get("rev_con"), note)

    return context["limited_count"]


def score_fcf_yield(fcf, market_cap, sector, config):
    fcf_number = as_number(fcf)
    market_cap_number = as_number(market_cap)
    if fcf_number is None or market_cap_number is None or market_cap_number <= 0 or fcf_number <= 0:
        return None

    fcf_yield = fcf_number / market_cap_number
    score = score_by_percentile_band(fcf_yield, config["mos"]["percentile_bands"]["fcf_yield"])
    return score, f"FCF yield {fcf_yield:.1%} percentile valuation signal"


def apply_ev_sales_cap(score, ev_to_sales, config):
    ev_sales = as_number(ev_to_sales)
    if score is None or ev_sales is None:
        return score, None
    for cap_rule in config["mos"]["ev_sales_caps"]:
        if ev_sales > cap_rule["gt"]:
            capped = min(score, cap_rule["cap"])
            if capped < score:
                return capped, f"EV/Sales {ev_sales:.1f} caps MoS at {cap_rule['cap']}"
            return score, None
    return score, None


def calculate_mos(stock, financial_detail, reverse_result, config):
    calculated = (financial_detail or {}).get("Calculated_Metrics") or {}
    signals = []
    notes = []
    pros = []

    fcf = as_number((financial_detail or {}).get("Free_Cash_Flow_TTM"))
    fcf_signal = score_fcf_yield(fcf, stock.get("marketCap"), stock.get("sector"), config)
    if fcf_signal is not None:
        signals.append(fcf_signal[0])
        pros.append(fcf_signal[1])
    elif fcf is not None and fcf <= 0:
        notes.append("No positive FCF; FCF-yield MoS signal dropped")

    ev_to_ebit = as_number(calculated.get("EV_to_EBIT"))
    if ev_to_ebit is not None and ev_to_ebit > 0:
        signals.append(
            score_by_percentile_band(ev_to_ebit, config["mos"]["percentile_bands"]["ev_to_ebit"])
        )
        pros.append(f"EV/EBIT {ev_to_ebit:.1f} valuation signal")
        notes.append("EV/EBIT uses EBIT proxy; true EBITDA history unavailable until Phase 6")

    anchor_multiple = as_number(calculated.get("Core_Anchor_Multiple_0.4Sales_0.4GP"))
    if anchor_multiple is not None and anchor_multiple > 0:
        signals.append(
            score_by_percentile_band(
                anchor_multiple, config["mos"]["percentile_bands"]["anchor_multiple"]
            )
        )
        pros.append(f"Anchor multiple {anchor_multiple:.1f} valuation signal")

    if not signals:
        reverse_result["rev_data_quality"] = max((reverse_result.get("rev_data_quality") or 0) - 1, 0)
        reverse_result["rev_mos"] = None
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            "MoS unavailable: no positive FCF, EV/EBIT, or anchor multiple signal",
        )
        return None, None

    mos = sum(signals) / len(signals)
    mos, cap_note = apply_ev_sales_cap(mos, calculated.get("EV_to_Sales"), config)
    if cap_note:
        notes.append(cap_note)

    if fcf is not None and fcf <= 0:
        cap = config["mos"]["negative_fcf_cap"]
        if mos > cap:
            mos = cap
        notes.append(f"Negative FCF caps MoS at {cap}")

    reverse_result["rev_mos"] = round(max(0, min(100, mos)), 2)
    for note in notes:
        reverse_result["rev_con"] = append_note(reverse_result.get("rev_con"), note)
    return reverse_result["rev_mos"], (pros[0] if pros else None)


def append_flag(reverse_result, flag):
    existing = reverse_result.get("rev_flags")
    flags = [item for item in (existing or "").split(",") if item]
    if flag not in flags:
        flags.append(flag)
    reverse_result["rev_flags"] = ",".join(flags)


def apply_stage8_flags(stock, financial_detail, reverse_result, config, battery_entry=None):
    """Stage 8 behavioral flags — advisory metadata ONLY. Never changes composite/band/rank."""
    flag_config = config.get("flags") or {}
    metrics = stock.get("metrics") or {}

    # --- INSIDER_HEAVY (available) ---
    insider = as_number(metrics.get("insiderOwnership"))
    threshold = flag_config.get("insider_heavy_threshold", 0.30)
    if insider is not None and insider > threshold:
        append_flag(reverse_result, "INSIDER_HEAVY")
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            f"INSIDER_HEAVY: insider ownership {insider:.1%} > {threshold:.0%} (alignment + liquidity risk)",
        )

    # --- PRICE_EXTENDED (available, using ~2yr Monthly_Closes) ---
    closes = (financial_detail or {}).get("Monthly_Closes")
    price = as_number(stock.get("price"))
    if closes and price is not None and price > 0:
        close_values = [as_number(v) for v in closes if as_number(v) is not None and as_number(v) > 0]
        if close_values:
            min_close = min(close_values)
            max_close = max(close_values)
            ratio_up = price / min_close if min_close > 0 else None
            ratio_down = max_close / price if price > 0 else None
            extended_up = ratio_up is not None and ratio_up > flag_config.get("price_extended_ratio", 1.5)
            extended_down = ratio_down is not None and ratio_down > flag_config.get("price_extended_ratio", 1.5)
            if extended_up or extended_down:
                append_flag(reverse_result, "PRICE_EXTENDED")
                direction = f"{ratio_up:.1f}x above 2yr low" if extended_up else f"{ratio_down:.1f}x below 2yr high"
                reverse_result["rev_con"] = append_note(
                    reverse_result.get("rev_con"),
                    f"PRICE_EXTENDED: current price {direction} (mean-reversion risk, short ~2yr window)",
                )

    # --- SHORT_INTEREST_EXTREME (Phase 6.1c: Short_Percent_Float now available) ---
    calculated = (financial_detail or {}).get("Calculated_Metrics") or {}
    short_float = as_number(calculated.get("Short_Percent_Float"))
    si_threshold = flag_config.get("short_interest_threshold", 0.20)
    if short_float is not None and short_float > si_threshold:
        append_flag(reverse_result, "SHORT_INTEREST_EXTREME")
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            f"SHORT_INTEREST_EXTREME: short interest {short_float:.1%} > {si_threshold:.0%} (squeeze/crowding risk)",
        )

    # --- CROWDED_LONG (Phase 6.1c: Held_Percent_Institutions now available) ---
    inst_held = as_number(calculated.get("Held_Percent_Institutions"))
    cl_threshold = flag_config.get("crowded_long_threshold", 0.98)
    if inst_held is not None and inst_held > cl_threshold:
        append_flag(reverse_result, "CROWDED_LONG")
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            f"CROWDED_LONG: institutional ownership {inst_held:.1%} > {cl_threshold:.1%} (exit-crowding risk)",
        )

    # --- Forensic battery flags (SEC companyfacts via fundamentals_battery.json) ---
    # Advisory like every Stage 8 flag. Thresholds config-overridable.
    if battery_entry:
        m_score = as_number(battery_entry.get("m_score"))
        m_threshold = flag_config.get("m_score_elevated_threshold", -1.78)
        if m_score is not None and m_score > m_threshold:
            append_flag(reverse_result, "M_SCORE_ELEVATED")
            reverse_result["rev_con"] = append_note(
                reverse_result.get("rev_con"),
                f"M_SCORE_ELEVATED: Beneish M {m_score:.2f} > {m_threshold} "
                "(earnings-manipulation risk profile; also fires on legitimate hypergrowth — verify)",
            )

        f_score = as_number(battery_entry.get("f_score"))
        f_checks = as_number(battery_entry.get("f_score_checks_available")) or 0
        f_max = flag_config.get("f_score_weak_max", 3)
        f_min_checks = flag_config.get("f_score_min_checks", 6)
        if f_score is not None and f_checks >= f_min_checks and f_score <= f_max:
            append_flag(reverse_result, "F_SCORE_WEAK")
            reverse_result["rev_con"] = append_note(
                reverse_result.get("rev_con"),
                f"F_SCORE_WEAK: Piotroski {int(f_score)}/{int(f_checks)} (deteriorating fundamentals; "
                "cheap + weak F is the classic value-trap profile)",
            )

        accruals = as_number(battery_entry.get("accruals_ratio"))
        accruals_threshold = flag_config.get("accruals_high_threshold", 0.10)
        if accruals is not None and accruals > accruals_threshold:
            append_flag(reverse_result, "ACCRUALS_HIGH")
            reverse_result["rev_con"] = append_note(
                reverse_result.get("rev_con"),
                f"ACCRUALS_HIGH: Sloan accruals {accruals:.2f} > {accruals_threshold} "
                "(reported earnings not backed by cash flow)",
            )

        issuance = as_number(battery_entry.get("net_issuance_3y_cagr"))
        issuance_threshold = flag_config.get("heavy_issuance_threshold", 0.10)
        if issuance is not None and issuance > issuance_threshold:
            append_flag(reverse_result, "HEAVY_ISSUANCE")
            reverse_result["rev_con"] = append_note(
                reverse_result.get("rev_con"),
                f"HEAVY_ISSUANCE: diluted shares +{issuance:.1%}/yr over 3y "
                "(SEC filings; split-adjusted-guarded)",
            )


def calculate_forward_eps_growth(financial_detail):
    calculated = (financial_detail or {}).get("Calculated_Metrics") or {}
    eps_ttm = as_number(calculated.get("EPS_TTM"))
    forward_eps = as_number(calculated.get("Forward_EPS_Estimate"))
    if eps_ttm is None or eps_ttm <= 0 or forward_eps is None:
        return None
    return ((forward_eps - eps_ttm) / eps_ttm) * 100


def apply_mos_low_data_cap(reverse_result):
    mos = as_number(reverse_result.get("rev_mos"))
    if mos is None or (reverse_result.get("rev_data_quality") or 0) >= 3 or mos <= 85:
        return False
    reverse_result["rev_mos"] = 85
    reverse_result["rev_con"] = append_note(
        reverse_result.get("rev_con"),
        "MoS capped at 85 because rev_data_quality<3",
    )
    return True


def median(values):
    clean = sorted(value for value in values if value is not None)
    if not clean:
        return None
    midpoint = len(clean) // 2
    if len(clean) % 2:
        return clean[midpoint]
    return (clean[midpoint - 1] + clean[midpoint]) / 2


def sector_beta_medians(stocks):
    by_sector = {}
    all_betas = []
    for stock in stocks:
        financial_detail = load_financial_detail(stock["symbol"])
        beta = as_number(((financial_detail or {}).get("Calculated_Metrics") or {}).get("Beta"))
        if beta is None:
            continue
        sector = stock.get("sector") or "Unknown"
        by_sector.setdefault(sector, []).append(beta)
        all_betas.append(beta)
    global_median = median(all_betas) or 1.0
    return {sector: median(values) for sector, values in by_sector.items()}, global_median


def beta_for_drawdown(stock, financial_detail, beta_medians, global_beta_median):
    beta = as_number(((financial_detail or {}).get("Calculated_Metrics") or {}).get("Beta"))
    if beta is not None:
        return beta, "real"
    sector = stock.get("sector") or "Unknown"
    fallback = beta_medians.get(sector)
    if fallback is None:
        fallback = global_beta_median
    return fallback, "sector_median"


def net_debt_to_real_ebitda(financial_detail):
    ebitda = latest_ebitda(financial_detail)
    total_debt = as_number((financial_detail or {}).get("Total_Debt"))
    total_cash = as_number((financial_detail or {}).get("Total_Cash"))
    if ebitda is None or ebitda <= 0 or total_debt is None or total_cash is None:
        return None
    net_debt = total_debt - total_cash
    return net_debt / ebitda


def apply_stage6_score(stock, financial_detail, reverse_result, config, beta_medians, global_beta_median):
    archetype = reverse_result.get("rev_archetype")
    calculated = (financial_detail or {}).get("Calculated_Metrics") or {}
    # Phase 6.1c: real multi-year CAGR with 1yr YoY fallback; tag growth_window
    multi_yr_cagr, growth_window = compute_multi_year_revenue_cagr(
        (financial_detail or {}).get("Annual_Income_Statement")
    )
    reverse_result["growth_window"] = growth_window
    revenue_growth_1yr = as_number(calculated.get("YoY_Revenue_Growth_%"))
    revenue_growth = multi_yr_cagr if multi_yr_cagr is not None else revenue_growth_1yr
    forward_eps_growth = calculate_forward_eps_growth(financial_detail)

    cap = (config.get("cagr") or {}).get("growth_caps", {}).get(archetype, 20)

    # Phase 6.1d: PRIMARY growth = revenue CAGR (tested against ceiling).
    # Forward EPS is a secondary, capped contributor — it can nudge the CAGR proxy
    # but CANNOT single-handedly drive HIGH_GROWTH_UNVERIFIED.
    if revenue_growth is not None:
        primary_growth = revenue_growth
    elif forward_eps_growth is not None:
        primary_growth = min(forward_eps_growth, cap)
    else:
        primary_growth = 0.0

    growth_2x_cap = cap * 2

    # GROWTH_UNVERIFIED on primary (>2x ceiling)
    if primary_growth > growth_2x_cap:
        append_flag(reverse_result, "GROWTH_UNVERIFIED")
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            f"GROWTH_UNVERIFIED: primary revenue CAGR {primary_growth:.1f}% > 2x archetype cap {cap}%",
        )

    # GROWTH_UNVERIFIED also on extreme forward EPS (still surfaced, just not gate-driving)
    if forward_eps_growth is not None and forward_eps_growth > growth_2x_cap:
        if "GROWTH_UNVERIFIED" not in (reverse_result.get("rev_flags") or ""):
            append_flag(reverse_result, "GROWTH_UNVERIFIED")
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            f"GROWTH_UNVERIFIED: forward EPS estimate {forward_eps_growth:.1f}% > 2x archetype cap {cap}% (EPS extreme, secondary signal)",
        )

    # HGUV base-rate ceiling test on PRIMARY (revenue CAGR) only
    primary_capped = primary_growth
    if primary_growth > cap:
        primary_capped = cap
        append_flag(reverse_result, "HIGH_GROWTH_UNVERIFIED")
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            f"HIGH_GROWTH_UNVERIFIED: revenue CAGR {primary_growth:.1f}% capped at {cap}% for archetype {archetype}",
        )

    if revenue_growth is None and forward_eps_growth is None:
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            "CAGR growth component limited: revenue CAGR and forward EPS growth unavailable",
        )

    # CAGR proxy = primary (capped) + modest forward EPS boost (capped at ceiling, 20% weight)
    eps_boost = 0.0
    if forward_eps_growth is not None and forward_eps_growth > 0:
        eps_boost = min(forward_eps_growth, cap) * 0.20
        if eps_boost > 0:
            reverse_result["rev_con"] = append_note(
                reverse_result.get("rev_con"),
                f"forward EPS secondary contribution +{eps_boost:.1f}% (capped at {cap}%, 20% weight)",
            )
    cagr_growth = primary_capped + eps_boost

    rerating = (as_number(reverse_result.get("rev_mos")) or 0) / config["cagr"]["rerating_divisor"]
    reverse_result["rev_cagr_proxy"] = round(cagr_growth + rerating, 2)
    reverse_result["rev_con"] = append_note(
        reverse_result.get("rev_con"),
        "dilution drag omitted from CAGR proxy because metrics.dilution is unreliable",
    )

    beta, beta_source = beta_for_drawdown(stock, financial_detail, beta_medians, global_beta_median)
    drawdown_config = config["drawdown"]
    beta_adj = (beta - 1) * drawdown_config["beta_sensitivity"]
    survivability_mult = (
        drawdown_config["low_survivability_multiplier"]
        if (reverse_result.get("rev_survivability") or 0) < drawdown_config["low_survivability_threshold"]
        else 1.0
    )
    leverage_adj = 0
    leverage = None
    if archetype not in ("G", "H"):
        leverage = net_debt_to_real_ebitda(financial_detail)
        if leverage is not None and leverage > drawdown_config["leverage_threshold"]:
            leverage_adj = drawdown_config["leverage_adjustment"]

    drawdown = drawdown_config["baseline"] * (1 + beta_adj) * survivability_mult + leverage_adj
    drawdown = max(drawdown, drawdown_config["floor"])
    reverse_result["rev_drawdown_proxy"] = round(drawdown, 4)
    efficiency = (
        reverse_result["rev_cagr_proxy"] / abs(reverse_result["rev_drawdown_proxy"])
        if reverse_result["rev_drawdown_proxy"]
        else 0
    )
    reverse_result["rev_efficiency"] = round(efficiency, 4)
    if beta_source == "sector_median":
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            f"Beta missing; sector-median beta fallback used ({beta:.2f})",
        )
    if archetype in ("G", "H") and latest_ebitda(financial_detail) is None:
        reverse_result["rev_con"] = append_note(
            reverse_result.get("rev_con"),
            "G/H null EBITDA protected: drawdown leverage adjustment skipped",
        )
    reverse_result["rev_con"] = append_note(
        reverse_result.get("rev_con"),
        "macro and adversarial haircuts omitted: inputs unavailable",
    )
    return beta_source


def calculate_full_composite(reverse_result, config):
    cagr_score = min(max((as_number(reverse_result.get("rev_cagr_proxy")) or 0) / config["cagr"]["cagr_score_full_at"] * 100, 0), 100)
    # Fix 2: cap CAGR sub-score at 60 for GROWTH_UNVERIFIED (contaminated tail)
    if "GROWTH_UNVERIFIED" in (reverse_result.get("rev_flags") or ""):
        cagr_score = min(cagr_score, 60)
    mos_score = as_number(reverse_result.get("rev_mos")) or 0
    quality_score = as_number(reverse_result.get("rev_quality")) or 0
    survivability_score = as_number(reverse_result.get("rev_survivability")) or 0
    efficiency = max(as_number(reverse_result.get("rev_efficiency")) or 0, 0)
    efficiency_score = min(efficiency / config["drawdown"]["efficiency_full_at"] * 100, 100)

    weights = config["composite"]["weights"]
    base = (
        weights["cagr"] * cagr_score
        + weights["mos"] * mos_score
        + weights["quality"] * quality_score
        + weights["survivability"] * survivability_score
        + weights["efficiency"] * efficiency_score
    )

    haircuts = []
    final = base
    if (reverse_result.get("rev_impairment_prob") or 0) > 0.20:
        final *= 0.50
        haircuts.append("impairment_prob>0.20 haircut applied")
    if (reverse_result.get("rev_data_quality") or 0) < 3:
        final *= 0.70
        haircuts.append("data_quality<3 haircut applied")
    # Fix 4: de-double-penalty — suppress low-conf haircut when caused by data sparsity (dq<3)
    if reverse_result.get("rev_route_confidence") == "low":
        if (reverse_result.get("rev_data_quality") or 0) < 3:
            haircuts.append("low route-confidence haircut SUPPRESSED (dq<3, correlated with data-quality penalty)")
        else:
            final *= 0.85
            haircuts.append("low route-confidence haircut applied")
    if "HIGH_GROWTH_UNVERIFIED" in (reverse_result.get("rev_flags") or ""):
        final *= 0.75
        haircuts.append("HIGH_GROWTH_UNVERIFIED haircut applied")
    # Fix 3: floor multiplicative haircut stack at 0.35 of base
    if base > 0 and final < base * 0.35:
        haircuts.append(f"haircut floor applied (would be {final/base:.3f}x, floored to 0.35x)")
        final = base * 0.35

    reverse_result["rev_composite"] = round(max(0, min(100, final)), 2)
    for note in haircuts:
        reverse_result["rev_con"] = append_note(reverse_result.get("rev_con"), note)

    return {
        "cagr_score": round(cagr_score, 2),
        "mos_score": round(mos_score, 2),
        "quality_score": round(quality_score, 2),
        "survivability_score": round(survivability_score, 2),
        "efficiency_score": round(efficiency_score, 2),
        "base": round(base, 2),
        "haircuts": haircuts,
        "final": reverse_result["rev_composite"],
    }


def limited_survivability_component(notes, name, reason, config):
    notes.append(f"limited survivability {name}: {reason}")
    return config["survivability"].get("limited_score", 10), 1


def survivability_leverage_score(stock, financial_detail, archetype, config):
    surv_config = config["survivability"]
    metrics = stock.get("metrics") or {}

    if archetype in ("G", "H") and latest_ebitda(financial_detail) is None:
        z_score = as_number(metrics.get("zScore"))
        if z_score is None:
            return surv_config.get("limited_score", 10), 1, "Altman zScore unavailable for G/H leverage-health proxy", None
        score = score_by_threshold(z_score, surv_config["leverage"]["gh_zscore_proxy"], 0)
        return score, 0, "G/H leverage-health uses zScore proxy because EBITDA is structurally null", None

    total_debt = as_number((financial_detail or {}).get("Total_Debt"))
    total_cash = as_number((financial_detail or {}).get("Total_Cash"))
    denominator, denominator_label = leverage_denominator(financial_detail)
    if total_debt is None or total_cash is None:
        return surv_config.get("limited_score", 10), 1, "Total_Debt/Total_Cash missing", None

    net_debt = total_debt - total_cash
    if net_debt <= 0:
        return surv_config["leverage"]["net_cash_score"], 0, "net cash", "net_cash"

    if denominator is None or denominator <= 0:
        return surv_config.get("limited_score", 10), 1, "EBITDA missing and EBIT proxy unusable", None

    leverage = net_debt / denominator
    score = score_by_threshold(leverage, surv_config["leverage"]["net_debt_to_ebitda"], 0)
    if denominator_label == "EBITDA":
        note = f"net debt / EBITDA {leverage:.2f}"
    else:
        note = f"net debt / EBIT proxy {leverage:.2f}; EBITDA null"
    return score, 0, note, leverage


def survivability_funding_score(financial_detail, config):
    surv_config = config["survivability"]
    total_cash = as_number((financial_detail or {}).get("Total_Cash"))
    fcf = as_number((financial_detail or {}).get("Free_Cash_Flow_TTM"))
    if fcf is None:
        return surv_config.get("limited_score", 10), 1, "Free_Cash_Flow_TTM missing"
    if fcf >= 0:
        return 20, 0, "positive FCF is self-funding"
    if total_cash is None:
        return surv_config.get("limited_score", 10), 1, "Total_Cash missing for cash-burn runway"
    runway_years = total_cash / abs(fcf) if fcf != 0 else None
    if runway_years is None:
        return surv_config.get("limited_score", 10), 1, "cash-burn runway unavailable"
    score = score_by_threshold(runway_years, surv_config["funding_gap_years"], 0)
    return score, 0, f"cash runway {runway_years:.2f} years"


def survivability_drawdown_score(financial_detail, config):
    surv_config = config["survivability"]
    drawdown = max_drawdown_pct((financial_detail or {}).get("Monthly_Closes"))
    if drawdown is None:
        return surv_config.get("limited_score", 10), 1, "fewer than 6 monthly closes"
    score = score_by_threshold(drawdown, surv_config["drawdown_pct"], 0)
    return score, 0, f"max drawdown {drawdown:.1f}% over short ~2yr window"


def impairment_probability_from_survivability(survivability, config):
    for band in config["survivability"]["impairment_probability"]:
        if "gte" in band and survivability >= band["gte"]:
            return band["probability"]
        if "lt" in band and survivability < band["lt"]:
            return band["probability"]
    return 0.60


def apply_survivability_score(stock, financial_detail, reverse_result, config):
    if reverse_result.get("rev_band") in ("Excluded", "Reject"):
        return None

    archetype = reverse_result.get("rev_archetype")
    notes = []
    limited_count = 0

    leverage_score, limited, leverage_note, leverage_value = survivability_leverage_score(
        stock, financial_detail, archetype, config
    )
    limited_count += limited
    notes.append(f"survivability leverage stress: {leverage_note}")

    funding_score, limited, funding_note = survivability_funding_score(financial_detail, config)
    limited_count += limited
    notes.append(f"survivability funding gap: {funding_note}")

    concentration_score, limited = limited_survivability_component(
        notes, "customer/counterparty concentration", "customer concentration data unavailable; v3.2 required", config
    )
    limited_count += limited

    dilution_score, limited = limited_survivability_component(
        notes, "dilution potential", "metrics.dilution unreliable; Phase 6.1 real dilution needed", config
    )
    limited_count += limited

    drawdown_score, limited, drawdown_note = survivability_drawdown_score(financial_detail, config)
    limited_count += limited
    notes.append(f"survivability drawdown history: {drawdown_note}")

    survivability = leverage_score + funding_score + concentration_score + dilution_score + drawdown_score
    reverse_result["rev_survivability"] = max(0, min(100, survivability))
    reverse_result["rev_impairment_prob"] = impairment_probability_from_survivability(
        reverse_result["rev_survivability"], config
    )

    if limited_count >= 3:
        reverse_result["rev_data_quality"] = max((reverse_result.get("rev_data_quality") or 0) - 1, 0)
        notes.append("survivability data sparse")

    for note in notes:
        reverse_result["rev_con"] = append_note(reverse_result.get("rev_con"), note)

    return {
        "limited_count": limited_count,
        "leverage_score": leverage_score,
        "leverage_value": leverage_value,
        "funding_score": funding_score,
        "drawdown_score": drawdown_score,
    }


def band_from_composite(composite, config):
    if composite is None:
        return "Monitor"
    bands = config["composite"]["bands"]
    if composite >= bands["High"]:
        return "High"
    if composite >= bands["Solid"]:
        return "Solid"
    if composite >= bands["Watchlist"]:
        return "Watchlist"
    if composite >= bands["Monitor"]:
        return "Monitor"
    return "Reject-tier"


def assign_dense_ranks(stocks):
    survivors = [
        stock
        for stock in stocks
        if (stock.get("reverse") or {}).get("rev_composite") is not None
        and (stock.get("reverse") or {}).get("rev_band") not in ("Excluded", "Reject")
    ]
    survivors.sort(
        key=lambda stock: (
            -as_number((stock.get("reverse") or {}).get("rev_composite")),
            -as_number((stock.get("reverse") or {}).get("rev_efficiency")),
            -as_number((stock.get("reverse") or {}).get("rev_survivability")),
            stock.get("symbol") or "",
        )
    )

    last_rank_key = None
    rank = 0
    for stock in survivors:
        reverse = stock.get("reverse") or {}
        rank_key = (
            reverse.get("rev_composite"),
            reverse.get("rev_efficiency"),
            reverse.get("rev_survivability"),
        )
        if rank_key != last_rank_key:
            rank += 1
            last_rank_key = rank_key
        stock["reverse"]["rev_rank"] = rank


def apply_stage9_nomination(stocks, config):
    """Stage 9 diversification + nomination — marks rev_nominated and watchlist."""
    div_config = config.get("diversification") or {}
    target_n = div_config.get("target_n", 25)
    max_archetype_pct = div_config.get("single_archetype_pct", 40) / 100.0
    max_sector_pct = div_config.get("single_sector_pct", 35) / 100.0
    max_country_pct = div_config.get("single_country_pct", 60) / 100.0

    # Reset all nominations
    for stock in stocks:
        rev = stock.get("reverse") or {}
        rev["rev_nominated"] = False

    # Build ranked pool of survivors
    survivors = [
        stock for stock in stocks
        if (stock.get("reverse") or {}).get("rev_composite") is not None
        and (stock.get("reverse") or {}).get("rev_band") not in ("Excluded", "Reject")
    ]
    survivors.sort(
        key=lambda s: (-(as_number((s.get("reverse") or {}).get("rev_composite")) or 0), s.get("symbol") or "")
    )

    nominated = []
    watchlisted = []

    for stock in survivors:
        if len(nominated) >= target_n:
            break

        rev = stock.get("reverse") or {}
        arch = rev.get("rev_archetype", "?")
        sector = stock.get("sector", "Unknown")

        # Simulate adding this stock
        test_set = nominated + [stock]

        # Check archetype cap (use target_n as denominator so first stock isn't auto-rejected)
        arch_count = sum(1 for s in test_set if (s.get("reverse") or {}).get("rev_archetype") == arch)
        if arch_count > max_archetype_pct * target_n:
            watchlisted.append((stock, f"archetype {arch} capped at {arch_count} (max {int(max_archetype_pct * target_n)})"))
            continue

        # Check sector cap
        sec_count = sum(1 for s in test_set if s.get("sector") == sector)
        if sec_count > max_sector_pct * target_n:
            watchlisted.append((stock, f"sector {sector} capped at {sec_count} (max {int(max_sector_pct * target_n)})"))
            continue

        # Check country cap (Phase 6.1c — Country now 96% populated; exempt Unknown/null)
        country = stock.get("country") or "Unknown"
        if country != "Unknown":
            ctry_count = sum(1 for s in test_set if (s.get("country") or "Unknown") == country)
            if ctry_count > max_country_pct * target_n:
                watchlisted.append((stock, f"country {country} capped at {ctry_count} (max {int(max_country_pct * target_n)})"))
                continue

        nominated.append(stock)

    # Mark nominated
    for stock in nominated:
        stock["reverse"]["rev_nominated"] = True

    # Mark watchlisted in rev_con
    for stock, reason in watchlisted:
        rev = stock.get("reverse") or {}
        rev["rev_nominated"] = False
        rev["rev_con"] = append_note(
            rev.get("rev_con"),
            f"watchlist: capped by {reason} diversification",
        )

    return {
        "nominated": [s["symbol"] for s in nominated],
        "nominated_count": len(nominated),
        "watchlisted_count": len(watchlisted),
        "watchlisted": [(s["symbol"], reason) for s, reason in watchlisted],
    }


def top25_from_scores(scores):
    ranked = [
        (ticker, reverse)
        for ticker, reverse in scores.items()
        if reverse.get("rev_composite") is not None
        and reverse.get("rev_band") not in ("Excluded", "Reject")
    ]
    ranked.sort(key=lambda item: (-(as_number(item[1].get("rev_composite")) or 0), item[0]))
    return [
        {
            "ticker": ticker,
            "archetype": reverse.get("rev_archetype"),
            "route_confidence": reverse.get("rev_route_confidence"),
            "quality": reverse.get("rev_quality"),
            "mos": reverse.get("rev_mos"),
            "survivability": reverse.get("rev_survivability"),
            "composite": reverse.get("rev_composite"),
        }
        for ticker, reverse in ranked[:25]
    ]


def confidence_counts_from_scores(scores):
    counts = {"high": 0, "medium": 0, "low": 0}
    for reverse in scores.values():
        if reverse.get("rev_composite") is None or reverse.get("rev_band") in ("Excluded", "Reject"):
            continue
        confidence = reverse.get("rev_route_confidence")
        if confidence in counts:
            counts[confidence] += 1
    return counts


def summarize_m1(stocks):
    ranked = sorted(
        [
            stock
            for stock in stocks
            if (stock.get("reverse") or {}).get("rev_composite") is not None
            and (stock.get("reverse") or {}).get("rev_band") not in ("Excluded", "Reject")
        ],
        key=lambda stock: (
            -as_number((stock.get("reverse") or {}).get("rev_composite")),
            stock.get("symbol") or "",
        ),
    )

    top50_mix = {key: 0 for key in "ABCDEFGHI"}
    for stock in ranked[:50]:
        top50_mix[stock["reverse"]["rev_archetype"]] += 1

    composite_sums = {key: 0 for key in "ABCDEFGHI"}
    composite_counts = {key: 0 for key in "ABCDEFGHI"}
    band_counts = {"High": 0, "Solid": 0, "Watchlist": 0, "Monitor": 0, "Reject-tier": 0}
    for stock in ranked:
        reverse = stock["reverse"]
        archetype = reverse["rev_archetype"]
        composite_sums[archetype] += reverse["rev_composite"]
        composite_counts[archetype] += 1
        band_counts[reverse["rev_band"]] += 1

    mean_composite = {
        archetype: round(composite_sums[archetype] / composite_counts[archetype], 2)
        if composite_counts[archetype]
        else None
        for archetype in "ABCDEFGHI"
    }
    top25 = [
        {
            "ticker": stock["symbol"],
            "archetype": stock["reverse"]["rev_archetype"],
            "route_confidence": stock["reverse"]["rev_route_confidence"],
            "quality": stock["reverse"]["rev_quality"],
            "mos": stock["reverse"]["rev_mos"],
            "cagr": stock["reverse"]["rev_cagr_proxy"],
            "drawdown": stock["reverse"]["rev_drawdown_proxy"],
            "efficiency": stock["reverse"]["rev_efficiency"],
            "survivability": stock["reverse"]["rev_survivability"],
            "data_quality": stock["reverse"]["rev_data_quality"],
            "composite": stock["reverse"]["rev_composite"],
        }
        for stock in ranked[:25]
    ]
    return top50_mix, mean_composite, top25, band_counts


def survivor_archetype_distribution_from_scores(scores):
    distribution = {key: 0 for key in "ABCDEFGHI"}
    for reverse in scores.values():
        archetype = reverse.get("rev_archetype")
        if archetype in distribution and reverse.get("rev_band") not in ("Excluded", "Reject"):
            distribution[archetype] += 1
    return distribution


def leaver_destinations(previous_scores, stocks, previous_archetype):
    destinations = {key: 0 for key in "ABCDEFGHI"}
    examples = []
    for stock in stocks:
        ticker = stock["symbol"]
        previous = previous_scores.get(ticker) or {}
        reverse = stock.get("reverse") or {}
        if previous.get("rev_archetype") != previous_archetype:
            continue
        if previous.get("rev_band") in ("Excluded", "Reject"):
            continue
        new_archetype = reverse.get("rev_archetype")
        if reverse.get("rev_band") in ("Excluded", "Reject") or new_archetype == previous_archetype:
            continue
        if new_archetype in destinations:
            destinations[new_archetype] += 1
        if len(examples) < 8:
            examples.append(
                {
                    "ticker": ticker,
                    "name": stock.get("name"),
                    "industry": stock.get("industry"),
                    "new_archetype": new_archetype,
                    "route_confidence": reverse.get("rev_route_confidence"),
                    "reason": reverse.get("rev_pro"),
                }
            )
    return destinations, examples


def ebitda_usage_counts(stocks):
    counts = {
        "real_ebitda": 0,
        "ebit_proxy_fallback": 0,
        "missing_both": 0,
        "gh_null_ebitda_protected": 0,
    }
    for stock in stocks:
        reverse = stock.get("reverse") or {}
        archetype = reverse.get("rev_archetype")
        if reverse.get("rev_band") in ("Excluded", "Reject"):
            continue
        financial_detail = load_financial_detail(stock["symbol"])
        ebitda = latest_ebitda(financial_detail)
        ebit_proxy = latest_ebit_proxy(financial_detail)
        if archetype in ("A", "B", "C", "D"):
            if ebitda is not None and ebitda > 0:
                counts["real_ebitda"] += 1
            elif ebit_proxy is not None and ebit_proxy > 0:
                counts["ebit_proxy_fallback"] += 1
            else:
                counts["missing_both"] += 1
        if archetype in ("G", "H") and ebitda is None:
            counts["gh_null_ebitda_protected"] += 1
    return counts


def validate_stocks(stocks):
    if not isinstance(stocks, list):
        raise RuntimeError("Expected public/data/stocks.json to contain a list of stock objects.")

    for index, stock in enumerate(stocks):
        if not isinstance(stock, dict):
            raise RuntimeError(f"Expected stock at index {index} to be an object.")
        if not stock.get("symbol"):
            raise RuntimeError(f"Expected stock at index {index} to have a symbol key.")


def attach_reverse_results(stocks, config, previous_scores=None):
    previous_scores = previous_scores or {}
    # Optional forensic sidecar (graceful absence: flags simply don't fire)
    fundamentals_battery = {}
    if FUNDAMENTALS_BATTERY_JSON.exists():
        try:
            fundamentals_battery = load_json(FUNDAMENTALS_BATTERY_JSON).get("tickers", {})
        except (OSError, json.JSONDecodeError, ValueError):
            fundamentals_battery = {}
    found_financials = 0
    missing_financials = 0
    scoreable_count = 0
    excluded_count = 0
    rejected_count = 0
    unknown_industry_scoreable = 0
    unknown_sector_scoreable = 0
    suspension_flips = 0
    archetype_counts = {key: 0 for key in "ABCDEFGHI"}
    confidence_counts = {"high": 0, "medium": 0, "low": 0}
    quality_sums = {key: 0 for key in "ABCDEFGHI"}
    quality_counts = {key: 0 for key in "ABCDEFGHI"}
    survivability_sums = {key: 0 for key in "ABCDEFGHI"}
    survivability_counts = {key: 0 for key in "ABCDEFGHI"}
    impairment_distribution = {
        "<0.10": 0,
        "0.10-0.20": 0,
        "0.20-0.35": 0,
        "0.35-0.55": 0,
        ">0.55": 0,
    }
    survivability_sparse_count = 0
    high_leverage_spot = None
    net_cash_spot = None
    limited_dimensions_total = 0
    mos_low_data_cap_count = 0
    high_growth_unverified_count = 0
    high_growth_unverified_by_arch = {key: 0 for key in "ABCDEFGHI"}
    growth_unverified_count = 0
    inst_held_values = []  # Phase 6.1c: collect for distribution measurement
    beta_usage_counts = {"real": 0, "sector_median": 0}
    composite_breakdowns = {}
    reverse_scores = {}
    joined_records = {}
    thresholds = config.get("thresholds") or {}
    stage0_thresholds = thresholds.get("stage0") or {}
    stage1_thresholds = thresholds.get("stage1") or {}
    beta_medians, global_beta_median = sector_beta_medians(stocks)

    for stock in stocks:
        ticker = stock["symbol"]
        financial_detail = load_financial_detail(ticker)
        if financial_detail is None:
            missing_financials += 1
        else:
            found_financials += 1

        joined_records[ticker] = build_joined_record(stock, financial_detail)

        reverse_result = empty_reverse_result()
        exclusion_reasons = stage0_exclusion_reasons(stock, stage0_thresholds)
        if exclusion_reasons:
            excluded_count += 1
            reverse_result["rev_band"] = "Excluded"
            reverse_result["rev_con"] = "; ".join(exclusion_reasons)
        else:
            scoreable_count += 1
            if stock.get("industry") == "Unknown":
                unknown_industry_scoreable += 1
            if stock.get("sector") == "Unknown":
                unknown_sector_scoreable += 1

            preliminary_archetype, _, _ = route_archetype(stock, financial_detail, config)
            data_quality = calculate_data_quality(stock, financial_detail, preliminary_archetype)
            reverse_result["rev_data_quality"] = data_quality
            rejects, flags, notes = stage1_eliminators(
                stock, financial_detail, data_quality, stage1_thresholds
            )
            if flags:
                reverse_result["rev_flags"] = ",".join(flags)
            if rejects:
                rejected_count += 1
                reverse_result["rev_band"] = "Reject"
                reverse_result["rev_con"] = "; ".join(rejects)
            elif notes:
                reverse_result["rev_con"] = "; ".join(notes)

            if apply_leverage_suspension(stock, financial_detail, reverse_result, config):
                rejected_count -= 1
                suspension_flips += 1

            if reverse_result["rev_band"] is None:
                if reverse_result["rev_archetype"] is None:
                    archetype, confidence, route_reason = route_archetype(stock, financial_detail, config)
                    reverse_result["rev_archetype"] = archetype
                    reverse_result["rev_archetype_secondary"] = None
                    reverse_result["rev_route_confidence"] = confidence
                    if archetype == "A" and confidence == "low":
                        reverse_result["rev_con"] = append_note(
                            reverse_result.get("rev_con"),
                            f"Ambiguous route: {route_reason}",
                        )
                    elif archetype == "E" and confidence == "low":
                        reverse_result["rev_con"] = append_note(
                            reverse_result.get("rev_con"),
                            route_reason,
                        )
                    else:
                        reverse_result["rev_pro"] = route_reason

                archetype_counts[reverse_result["rev_archetype"]] += 1
                confidence_counts[reverse_result["rev_route_confidence"]] += 1
                limited_dimensions_total += apply_quality_score(
                    stock, financial_detail, reverse_result, config
                )
                mos, mos_reason = calculate_mos(stock, financial_detail, reverse_result, config)
                # Phase polish: build clean deduplicated rev_pro
                route_reason = reverse_result.get("rev_pro")
                reverse_result["rev_pro"] = clean_rev_pro(mos_reason, route_reason)

                quality_sums[reverse_result["rev_archetype"]] += reverse_result["rev_quality"]
                quality_counts[reverse_result["rev_archetype"]] += 1

                survivability_detail = apply_survivability_score(
                    stock, financial_detail, reverse_result, config
                )
                archetype = reverse_result["rev_archetype"]
                survivability_sums[archetype] += reverse_result["rev_survivability"]
                survivability_counts[archetype] += 1
                impairment = reverse_result["rev_impairment_prob"]
                if impairment < 0.10:
                    impairment_distribution["<0.10"] += 1
                elif impairment < 0.20:
                    impairment_distribution["0.10-0.20"] += 1
                elif impairment < 0.35:
                    impairment_distribution["0.20-0.35"] += 1
                elif impairment <= 0.55:
                    impairment_distribution["0.35-0.55"] += 1
                else:
                    impairment_distribution[">0.55"] += 1

                if survivability_detail and survivability_detail["limited_count"] >= 3:
                    survivability_sparse_count += 1

                if (
                    survivability_detail
                    and isinstance(survivability_detail["leverage_value"], float)
                    and survivability_detail["leverage_value"] > 4
                    and (
                        high_leverage_spot is None
                        or reverse_result["rev_survivability"] < high_leverage_spot["survivability"]
                    )
                ):
                    high_leverage_spot = {
                        "ticker": ticker,
                        "archetype": archetype,
                        "leverage": round(survivability_detail["leverage_value"], 2),
                        "leverage_score": survivability_detail["leverage_score"],
                        "survivability": reverse_result["rev_survivability"],
                        "impairment_prob": reverse_result["rev_impairment_prob"],
                    }

                if (
                    survivability_detail
                    and survivability_detail["leverage_value"] == "net_cash"
                    and (
                        net_cash_spot is None
                        or reverse_result["rev_survivability"] > net_cash_spot["survivability"]
                    )
                ):
                    net_cash_spot = {
                        "ticker": ticker,
                        "archetype": archetype,
                        "leverage": "net_cash",
                        "leverage_score": survivability_detail["leverage_score"],
                        "survivability": reverse_result["rev_survivability"],
                        "impairment_prob": reverse_result["rev_impairment_prob"],
                    }

                if apply_mos_low_data_cap(reverse_result):
                    mos_low_data_cap_count += 1

                beta_source = apply_stage6_score(
                    stock, financial_detail, reverse_result, config, beta_medians, global_beta_median
                )
                beta_usage_counts[beta_source] += 1
                breakdown = calculate_full_composite(reverse_result, config)
                reverse_result["rev_band"] = band_from_composite(reverse_result["rev_composite"], config)
                if "HIGH_GROWTH_UNVERIFIED" in (reverse_result.get("rev_flags") or ""):
                    high_growth_unverified_count += 1
                    arch = reverse_result.get("rev_archetype")
                    if arch in high_growth_unverified_by_arch:
                        high_growth_unverified_by_arch[arch] += 1
                if "GROWTH_UNVERIFIED" in (reverse_result.get("rev_flags") or ""):
                    growth_unverified_count += 1
                if ticker in ("ACN", "TSM"):
                    composite_breakdowns[ticker] = breakdown

                # Stage 8: advisory flags (AFTER band/composite — metadata only)
                apply_stage8_flags(stock, financial_detail, reverse_result, config,
                                   battery_entry=fundamentals_battery.get(ticker))

            # Phase 6.1c: collect institutional ownership for distribution measurement
            if reverse_result.get("rev_band") not in ("Excluded", "Reject", None):
                calculated = (financial_detail or {}).get("Calculated_Metrics") or {}
                ih = as_number(calculated.get("Held_Percent_Institutions"))
                if ih is not None:
                    inst_held_values.append(ih)

        stock["reverse"] = reverse_result
        reverse_scores[ticker] = reverse_result.copy()

    assign_dense_ranks(stocks)
    nomination_result = apply_stage9_nomination(stocks, config)
    reverse_scores = {stock["symbol"]: stock["reverse"].copy() for stock in stocks}
    top50_mix, mean_composite, top25, band_counts = summarize_m1(stocks)
    top10_composites = [row["composite"] for row in top25[:10]]
    previous_archetype_counts = survivor_archetype_distribution_from_scores(previous_scores)
    g_leavers, g_leaver_examples = leaver_destinations(previous_scores, stocks, "G")
    h_leavers, h_leaver_examples = leaver_destinations(previous_scores, stocks, "H")
    ebitda_counts = ebitda_usage_counts(stocks)

    # Phase 6.1c: measure institutional distribution, set CROWDED_LONG threshold at ~p95
    inst_distribution = {}
    if inst_held_values:
        sorted_inst = sorted(inst_held_values)
        n = len(sorted_inst)
        inst_distribution = {
            "count": n,
            "p50": round(sorted_inst[int(n * 0.50)], 4),
            "p75": round(sorted_inst[int(n * 0.75)], 4),
            "p90": round(sorted_inst[int(n * 0.90)], 4),
            "p95": round(sorted_inst[int(n * 0.95)], 4),
            "p99": round(sorted_inst[int(n * 0.99)], 4),
            "max": round(sorted_inst[-1], 4),
        }
        # Override config threshold with measured p95
        measured_p95 = inst_distribution["p95"]
        if "flags" in config:
            config["flags"]["crowded_long_threshold"] = measured_p95
        # Re-apply CROWDED_LONG with measured threshold for all survivors
        for stock in stocks:
            rev = stock.get("reverse") or {}
            if rev.get("rev_band") in ("Excluded", "Reject", None):
                continue
            fd = load_financial_detail(stock["symbol"])
            calculated = (fd or {}).get("Calculated_Metrics") or {}
            inst_held = as_number(calculated.get("Held_Percent_Institutions"))
            flags = (rev.get("rev_flags") or "").split(",")
            flags = [f for f in flags if f != "CROWDED_LONG"]
            if inst_held is not None and inst_held > measured_p95:
                flags.append("CROWDED_LONG")
                rev["rev_con"] = append_note(
                    rev.get("rev_con"),
                    f"CROWDED_LONG: institutional ownership {inst_held:.1%} > {measured_p95:.1%} (exit-crowding risk, p95 threshold)",
                )
            rev["rev_flags"] = ",".join([f for f in flags if f]) if flags else None
    else:
        inst_distribution = {"count": 0}

    # Phase polish: clean rev_con — remove engine-internal caveats, keep real concerns
    for stock in stocks:
        rev = stock.get("reverse") or {}
        original_con = rev.get("rev_con")
        if original_con:
            rev["rev_con"] = clean_rev_con(original_con, rev)

    # Rebuild reverse_scores snapshot AFTER cleanup (was snapshotted too early at line 1835)
    reverse_scores = {stock["symbol"]: stock["reverse"].copy() for stock in stocks}

    mean_quality_by_archetype = {}
    for archetype in "ABCDEFGHI":
        count = quality_counts[archetype]
        mean_quality_by_archetype[archetype] = round(quality_sums[archetype] / count, 2) if count else None

    mean_survivability_by_archetype = {}
    for archetype in "ABCDEFGHI":
        count = survivability_counts[archetype]
        mean_survivability_by_archetype[archetype] = (
            round(survivability_sums[archetype] / count, 2) if count else None
        )

    low_data_quality_count = sum(
        1
        for stock in stocks
        if (stock.get("reverse") or {}).get("rev_band") not in ("Excluded", "Reject")
        and ((stock.get("reverse") or {}).get("rev_data_quality") or 0) <= 2
    )
    etf_count = sum(
        1
        for stock in stocks
        if (stock.get("reverse") or {}).get("rev_band") not in ("Excluded", "Reject")
        and (stock.get("reverse") or {}).get("rev_archetype") == "I"
    )

    # Stage 8 flag counts (recomputed after potential CROWDED_LONG re-apply)
    flag_counts = {
        "GROWTH_UNVERIFIED": 0,
        "HIGH_GROWTH_UNVERIFIED": 0,
        "INSIDER_HEAVY": 0,
        "PRICE_EXTENDED": 0,
        "SHORT_INTEREST_EXTREME": 0,
        "CROWDED_LONG": 0,
    }
    for stock in stocks:
        rev = stock.get("reverse") or {}
        if rev.get("rev_band") in ("Excluded", "Reject", None):
            continue
        flags = (rev.get("rev_flags") or "").split(",")
        for f in flag_counts:
            if f in flags:
                flag_counts[f] += 1

    # Nominated set details
    nominated_details = []
    for stock in stocks:
        rev = stock.get("reverse") or {}
        if rev.get("rev_nominated"):
            nominated_details.append({
                "ticker": stock["symbol"],
                "name": stock.get("name", ""),
                "archetype": rev.get("rev_archetype"),
                "sector": stock.get("sector", "Unknown"),
                "country": stock.get("country", "Unknown"),
                "composite": rev.get("rev_composite"),
            })

    nominated_arch_mix = {}
    nominated_sector_mix = {}
    nominated_country_mix = {}
    for nd in nominated_details:
        nominated_arch_mix[nd["archetype"]] = nominated_arch_mix.get(nd["archetype"], 0) + 1
        nominated_sector_mix[nd["sector"]] = nominated_sector_mix.get(nd["sector"], 0) + 1
        nominated_country_mix[nd["country"]] = nominated_country_mix.get(nd["country"], 0) + 1

    # Growth window distribution (Phase 6.1c)
    growth_window_counts = {"3yr": 0, "2yr": 0, "1yr": 0}
    for stock in stocks:
        rev = stock.get("reverse") or {}
        gw = rev.get("growth_window", "1yr")
        if gw in growth_window_counts:
            growth_window_counts[gw] += 1

    diagnostics = {
        "total_stocks": len(stocks),
        "scoreable": scoreable_count,
        "excluded": excluded_count,
        "rejected": rejected_count,
        "financial_jsons_found": found_financials,
        "financial_jsons_missing": missing_financials,
        "scoreable_unknown_industry": unknown_industry_scoreable,
        "scoreable_unknown_sector": unknown_sector_scoreable,
        "suspension_flips": suspension_flips,
        "archetype_counts": archetype_counts,
        "previous_archetype_counts": previous_archetype_counts,
        "g_leavers": g_leavers,
        "g_leaver_examples": g_leaver_examples,
        "h_leavers": h_leavers,
        "h_leaver_examples": h_leaver_examples,
        "ebitda_usage_counts": ebitda_counts,
        "confidence_counts": confidence_counts,
        "mean_quality_by_archetype": mean_quality_by_archetype,
        "low_data_quality_count": low_data_quality_count,
        "limited_dimensions_total": limited_dimensions_total,
        "mos_low_data_cap_count": mos_low_data_cap_count,
        "high_growth_unverified_count": high_growth_unverified_count,
        "high_growth_unverified_by_arch": high_growth_unverified_by_arch,
        "growth_unverified_count": growth_unverified_count,
        "beta_usage_counts": beta_usage_counts,
        "composite_breakdowns": composite_breakdowns,
        "before_top25": top25_from_scores(previous_scores),
        "before_confidence_counts": confidence_counts_from_scores(previous_scores),
        "mean_survivability_by_archetype": mean_survivability_by_archetype,
        "impairment_distribution": impairment_distribution,
        "survivability_sparse_count": survivability_sparse_count,
        "high_leverage_spot": high_leverage_spot,
        "net_cash_spot": net_cash_spot,
        "etf_count": etf_count,
        "top50_mix": top50_mix,
        "top10_composites": top10_composites,
        "mean_composite_by_archetype": mean_composite,
        "top25": top25,
        "band_counts": band_counts,
        "flag_counts": flag_counts,
        "nominated_details": nominated_details,
        "nominated_arch_mix": nominated_arch_mix,
        "nominated_sector_mix": nominated_sector_mix,
        "nominated_country_mix": nominated_country_mix,
        "nomination_result": nomination_result,
        "growth_window_counts": growth_window_counts,
        "inst_distribution": inst_distribution,
    }
    return reverse_scores, joined_records, diagnostics


def main():
    config = load_json(CONFIG_JSON)
    stocks = load_json(STOCKS_JSON)
    previous_scores = load_json(REVERSE_SCORES_JSON) if REVERSE_SCORES_JSON.exists() else {}
    validate_stocks(stocks)

    reverse_scores, joined_records, diagnostics = attach_reverse_results(stocks, config, previous_scores)
    if len(joined_records) != len(stocks):
        raise RuntimeError("Joined record count did not match stock count.")

    write_json(STOCKS_JSON, stocks)
    write_json(REVERSE_SCORES_JSON, reverse_scores)

    print(
        "Reverse Stage 0/1 complete: "
        f"total stocks={diagnostics['total_stocks']}, "
        f"scoreable={diagnostics['scoreable']}, "
        f"excluded={diagnostics['excluded']}, "
        f"rejected={diagnostics['rejected']}, "
        f"financial JSONs found={diagnostics['financial_jsons_found']}, "
        f"financial JSONs missing={diagnostics['financial_jsons_missing']}, "
        f"scoreable industry Unknown={diagnostics['scoreable_unknown_industry']}, "
        f"scoreable sector Unknown={diagnostics['scoreable_unknown_sector']}, "
        f"suspension flips={diagnostics['suspension_flips']}"
    )
    print(f"Archetype distribution: {diagnostics['archetype_counts']}")
    print(f"Stale M1 archetype distribution: {diagnostics['previous_archetype_counts']}")
    print(f"Current vs stale archetype distribution: stale={diagnostics['previous_archetype_counts']} current={diagnostics['archetype_counts']}")
    print(f"Former G leaver destinations: {diagnostics['g_leavers']}")
    print(f"Former H leaver destinations: {diagnostics['h_leavers']}")
    print(f"A/B/C/D EBITDA usage: {diagnostics['ebitda_usage_counts']}")
    print(f"Former G leaver examples: {diagnostic_repr(diagnostics['g_leaver_examples'])}")
    print(f"Former H leaver examples: {diagnostic_repr(diagnostics['h_leaver_examples'])}")
    print(f"Route confidence before retune: {diagnostics['before_confidence_counts']}")
    print(f"Route confidence counts: {diagnostics['confidence_counts']}")
    print(f"Mean quality by archetype: {diagnostics['mean_quality_by_archetype']}")
    print(f"Mean survivability by archetype: {diagnostics['mean_survivability_by_archetype']}")
    print(f"Impairment probability distribution: {diagnostics['impairment_distribution']}")
    print(f"Survivability sparse component count: {diagnostics['survivability_sparse_count']}")
    print(f"High-leverage survivability spot: {diagnostic_repr(diagnostics['high_leverage_spot'])}")
    print(f"Net-cash survivability spot: {diagnostic_repr(diagnostics['net_cash_spot'])}")
    print(f"Data quality <= 2 count: {diagnostics['low_data_quality_count']}")
    print(f"Limited dimensions total: {diagnostics['limited_dimensions_total']}")
    print(f"MoS low-data cap count: {diagnostics['mos_low_data_cap_count']}")
    print(f"HIGH_GROWTH_UNVERIFIED count: {diagnostics['high_growth_unverified_count']}")
    print(f"HIGH_GROWTH_UNVERIFIED by archetype: {diagnostics['high_growth_unverified_by_arch']}")
    print(f"GROWTH_UNVERIFIED count: {diagnostics['growth_unverified_count']}")
    print(f"Beta usage counts: {diagnostics['beta_usage_counts']}")
    print(f"Composite breakdowns: {diagnostic_repr(diagnostics['composite_breakdowns'])}")
    print(f"ETFs detected: {diagnostics['etf_count']}")
    print(f"\n--- Phase 6.1c: Growth Window Mix ---")
    print(f"growth_window counts: {diagnostics['growth_window_counts']}")
    print(f"\n--- Phase 6.1c: Institutional Ownership Distribution ---")
    idist = diagnostics["inst_distribution"]
    if idist.get("count", 0) > 0:
        print(f"  n={idist['count']}  p50={idist['p50']:.1%}  p75={idist['p75']:.1%}  p90={idist['p90']:.1%}  p95={idist['p95']:.1%}  p99={idist['p99']:.1%}  max={idist['max']:.1%}")
        print(f"  CROWDED_LONG threshold set to p95 = {idist['p95']:.1%}")
    else:
        print(f"  No institutional data available")
    print("Full composite: CAGR/MoS/Quality/Survivability/Efficiency with available haircuts")
    print(f"Top 50 archetype mix: {diagnostics['top50_mix']}")
    print(f"Top 10 composites: {diagnostics['top10_composites']}")
    print(f"Mean composite by archetype: {diagnostics['mean_composite_by_archetype']}")
    print(f"Band distribution: {diagnostics['band_counts']}")

    # ── Stage 8 flag counts ──
    print("\n--- Stage 8 flag counts (survivors only) ---")
    survivor_total = sum(1 for s in stocks if (s.get("reverse") or {}).get("rev_band") not in ("Excluded", "Reject", None))
    print(f"  Survivor pool: {survivor_total}")
    print(f"  HIGH_GROWTH_UNVERIFIED overall: {diagnostics['high_growth_unverified_count']}/{survivor_total} ({round(diagnostics['high_growth_unverified_count']/survivor_total*100,1)}%)" if survivor_total > 0 else "  HIGH_GROWTH_UNVERIFIED overall: N/A")
    print(f"  HIGH_GROWTH_UNVERIFIED by archetype: {diagnostics['high_growth_unverified_by_arch']}")
    print(f"  GROWTH_UNVERIFIED: {diagnostics['growth_unverified_count']}")
    for flag_name in ["INSIDER_HEAVY", "PRICE_EXTENDED", "SHORT_INTEREST_EXTREME", "CROWDED_LONG"]:
        count = diagnostics["flag_counts"].get(flag_name, 0)
        print(f"  {flag_name}: {count}")

    # ── Stage 9 nomination ──
    print("\n--- Stage 9: Diversified Nomination (M2) ---")
    nr = diagnostics["nomination_result"]
    print(f"  Nominated: {nr['nominated_count']} | Watchlisted: {nr['watchlisted_count']}")
    print(f"  Archetype mix: {diagnostics['nominated_arch_mix']}")
    print(f"  Sector mix: {diagnostics['nominated_sector_mix']}")
    print(f"  Country mix: {diagnostics['nominated_country_mix']}")

    # Prove caps respected
    total_n = nr["nominated_count"]
    if total_n > 0:
        max_arch = max(diagnostics["nominated_arch_mix"].values()) if diagnostics["nominated_arch_mix"] else 0
        max_sec = max(diagnostics["nominated_sector_mix"].values()) if diagnostics["nominated_sector_mix"] else 0
        max_ctry = max(diagnostics["nominated_country_mix"].values()) if diagnostics["nominated_country_mix"] else 0
        print(f"  Max archetype share: {max_arch}/{total_n} ({round(max_arch/total_n*100)}%) -- cap: <=40%")
        print(f"  Max sector share: {max_sec}/{total_n} ({round(max_sec/total_n*100)}%) -- cap: <=35%")
        print(f"  Max country share: {max_ctry}/{total_n} ({round(max_ctry/total_n*100)}%) -- cap: <=60%")

    print(f"\n  Nominated 25:")
    for nd in diagnostics["nominated_details"]:
        print(f"    {nd['ticker']:6s}  {nd['archetype']}  {nd['sector'][:25]:25s}  {nd.get('country','?')[:5]:5s}  composite={nd['composite']}")

    if nr["watchlisted_count"] <= 15:
        print(f"\n  Watchlisted (capped by diversification):")
        for ticker, reason in nr["watchlisted"]:
            print(f"    {ticker}: {reason}")

    print("Before top 25 by rev_composite:")
    for row in diagnostics["before_top25"]:
        print(
            f"{row['ticker']}\t{row['archetype']}\tconf={row['route_confidence']}\t"
            f"quality={row['quality']}\tmos={row['mos']}\t"
            f"survivability={row['survivability']}\tcomposite={row['composite']}"
        )
    print("Top 25 by rev_composite:")
    for row in diagnostics["top25"]:
        print(
            f"{row['ticker']}\t{row['archetype']}\tconf={row['route_confidence']}\t"
            f"quality={row['quality']}\tmos={row['mos']}\t"
            f"survivability={row['survivability']}\tcagr={row['cagr']}\t"
            f"drawdown={row['drawdown']}\tefficiency={row['efficiency']}\t"
            f"data_quality={row['data_quality']}\tcomposite={row['composite']}"
        )

    # ── Phase 7c.2 BEFORE/AFTER COMPARISON ──
    print("\n" + "=" * 70)
    print("PHASE 7c.2 BEFORE/AFTER COMPARISON")
    print("=" * 70)

    # Build after-data from processed stocks
    after_scores = {stock["symbol"]: stock.get("reverse") or {} for stock in stocks}

    # --- HIGH_GROWTH_UNVERIFIED per archetype ---
    print("\n--- HIGH_GROWTH_UNVERIFIED firing per archetype ---")
    before_brr = {}
    after_brr = {}
    after_growth_unverified = {}
    for stock in stocks:
        ticker = stock["symbol"]
        arch = (after_scores.get(ticker) or {}).get("rev_archetype", "?")
        prev = previous_scores.get(ticker) or {}
        if (after_scores.get(ticker) or {}).get("rev_band") in ("Excluded", "Reject", None):
            continue

        before_brr[arch] = before_brr.get(arch, {"total": 0, "brr": 0})
        after_brr[arch] = after_brr.get(arch, {"total": 0, "brr": 0})
        after_growth_unverified[arch] = after_growth_unverified.get(arch, {"total": 0, "guv": 0})

        before_brr[arch]["total"] += 1
        after_brr[arch]["total"] += 1
        after_growth_unverified[arch]["total"] += 1

        if "HIGH_GROWTH_UNVERIFIED" in (prev.get("rev_flags") or ""):
            before_brr[arch]["brr"] += 1
        if "HIGH_GROWTH_UNVERIFIED" in ((after_scores.get(ticker) or {}).get("rev_flags") or ""):
            after_brr[arch]["brr"] += 1
        if "GROWTH_UNVERIFIED" in ((after_scores.get(ticker) or {}).get("rev_flags") or ""):
            after_growth_unverified[arch]["guv"] += 1

    total_before_brr = 0
    total_after_brr = 0
    total_guv = 0
    total_scorable = 0
    for arch in sorted(set(list(before_brr.keys()) + list(after_brr.keys()))):
        b = before_brr.get(arch, {"total": 0, "brr": 0})
        a = after_brr.get(arch, {"total": 0, "brr": 0})
        guv = after_growth_unverified.get(arch, {"total": 0, "guv": 0})
        b_pct = round(b["brr"] / b["total"] * 100, 1) if b["total"] else 0
        a_pct = round(a["brr"] / a["total"] * 100, 1) if a["total"] else 0
        total_before_brr += b["brr"]
        total_after_brr += a["brr"]
        total_guv += guv["guv"]
        total_scorable += a["total"]
        print(f"  {arch}: {b['brr']}/{b['total']} ({b_pct}%) → {a['brr']}/{a['total']} ({a_pct}%)")

    print(f"  TOTAL: {total_before_brr}/{total_scorable} ({round(total_before_brr/total_scorable*100,1) if total_scorable else 0}%) → "
          f"{total_after_brr}/{total_scorable} ({round(total_after_brr/total_scorable*100,1) if total_scorable else 0}%)")

    # --- GROWTH_UNVERIFIED ---
    print(f"\n--- GROWTH_UNVERIFIED: {total_guv} total ---")
    for arch in sorted(after_growth_unverified.keys()):
        guv = after_growth_unverified[arch]
        if guv["guv"]:
            print(f"  {arch}: {guv['guv']}/{guv['total']} ({round(guv['guv']/guv['total']*100,1)}%)")

    # --- Haircut floor + mean final/base ---
    print("\n--- Haircut floor + mean final/base ratio ---")
    before_ratios = []
    after_ratios = []
    floor_rescued = 0
    floor_rescued_names = []
    for stock in stocks:
        ticker = stock["symbol"]
        rev = stock.get("reverse") or {}
        prev = previous_scores.get(ticker) or {}
        if rev.get("rev_band") in ("Excluded", "Reject", None) or rev.get("rev_composite") is None:
            continue

        # After: compute base and ratio
        w = config["composite"]["weights"]
        cagr_s = min(max((as_number(rev.get("rev_cagr_proxy")) or 0) / config["cagr"]["cagr_score_full_at"] * 100, 0), 100)
        if "GROWTH_UNVERIFIED" in (rev.get("rev_flags") or ""):
            cagr_s = min(cagr_s, 60)
        mos_s = as_number(rev.get("rev_mos")) or 0
        qual_s = as_number(rev.get("rev_quality")) or 0
        surv_s = as_number(rev.get("rev_survivability")) or 0
        eff = max(as_number(rev.get("rev_efficiency")) or 0, 0)
        eff_s = min(eff / config["drawdown"]["efficiency_full_at"] * 100, 100)
        after_base = (w["cagr"] * cagr_s + w["mos"] * mos_s + w["quality"] * qual_s
                      + w["survivability"] * surv_s + w["efficiency"] * eff_s)
        after_final = as_number(rev.get("rev_composite"))
        if after_base and after_base > 0 and after_final is not None:
            after_ratios.append(after_final / after_base)
            # Detect floor: if final == base * 0.35 (within rounding) and would be lower
            if abs(after_final - after_base * 0.35) < 0.5:
                # Check if it would have been lower without floor
                hc_product = 1.0
                if (rev.get("rev_impairment_prob") or 0) > 0.20:
                    hc_product *= 0.50
                if (rev.get("rev_data_quality") or 0) < 3:
                    hc_product *= 0.70
                if rev.get("rev_route_confidence") == "low" and (rev.get("rev_data_quality") or 0) >= 3:
                    hc_product *= 0.85
                if "HIGH_GROWTH_UNVERIFIED" in (rev.get("rev_flags") or ""):
                    hc_product *= 0.75
                if hc_product < 0.35:
                    floor_rescued += 1
                    floor_rescued_names.append(f"{ticker}({rev.get('rev_archetype')}: base={after_base:.1f}, no-floor={after_base*hc_product:.1f}, floor={after_final:.1f})")

        # Before: from stored rev_composite and compute base the old way (same base, old haircuts)
        prev_final = as_number(prev.get("rev_composite"))
        if prev_final is not None:
            prev_cagr_s = min(max((as_number(prev.get("rev_cagr_proxy")) or 0) / config["cagr"]["cagr_score_full_at"] * 100, 0), 100)
            prev_base = (w["cagr"] * prev_cagr_s + w["mos"] * (as_number(prev.get("rev_mos")) or 0)
                         + w["quality"] * (as_number(prev.get("rev_quality")) or 0)
                         + w["survivability"] * (as_number(prev.get("rev_survivability")) or 0)
                         + w["efficiency"] * (min(max(as_number(prev.get("rev_efficiency")) or 0, 0) / config["drawdown"]["efficiency_full_at"] * 100, 100)))
            if prev_base > 0:
                before_ratios.append(prev_final / prev_base)

    mean_before_ratio = round(sum(before_ratios) / len(before_ratios), 3) if before_ratios else 0
    mean_after_ratio = round(sum(after_ratios) / len(after_ratios), 3) if after_ratios else 0
    print(f"  Mean final/base ratio: {mean_before_ratio} → {mean_after_ratio}")
    print(f"  Names rescued by floor (0.35x): {floor_rescued}")
    if floor_rescued <= 20:
        for name in floor_rescued_names:
            print(f"    {name}")

    # --- F cohort before/after ---
    print("\n--- F cohort before/after ---")
    f_before_base = []
    f_before_final = []
    f_after_base = []
    f_after_final = []
    f_after_names = []
    for stock in stocks:
        ticker = stock["symbol"]
        rev = stock.get("reverse") or {}
        prev = previous_scores.get(ticker) or {}
        if rev.get("rev_archetype") != "F" or rev.get("rev_band") in ("Excluded", "Reject"):
            continue

        w = config["composite"]["weights"]
        # After
        cagr_s = min(max((as_number(rev.get("rev_cagr_proxy")) or 0) / config["cagr"]["cagr_score_full_at"] * 100, 0), 100)
        if "GROWTH_UNVERIFIED" in (rev.get("rev_flags") or ""):
            cagr_s = min(cagr_s, 60)
        after_base_val = (w["cagr"] * cagr_s + w["mos"] * (as_number(rev.get("rev_mos")) or 0)
                          + w["quality"] * (as_number(rev.get("rev_quality")) or 0)
                          + w["survivability"] * (as_number(rev.get("rev_survivability")) or 0)
                          + w["efficiency"] * (min(max(as_number(rev.get("rev_efficiency")) or 0, 0) / config["drawdown"]["efficiency_full_at"] * 100, 100)))
        after_final_val = as_number(rev.get("rev_composite"))
        if after_base_val and after_final_val is not None:
            f_after_base.append(after_base_val)
            f_after_final.append(after_final_val)
            f_after_names.append((ticker, after_final_val))

        # Before
        prev_final_val = as_number(prev.get("rev_composite"))
        if prev_final_val is not None:
            prev_cagr_s = min(max((as_number(prev.get("rev_cagr_proxy")) or 0) / config["cagr"]["cagr_score_full_at"] * 100, 0), 100)
            prev_base_val = (w["cagr"] * prev_cagr_s + w["mos"] * (as_number(prev.get("rev_mos")) or 0)
                             + w["quality"] * (as_number(prev.get("rev_quality")) or 0)
                             + w["survivability"] * (as_number(prev.get("rev_survivability")) or 0)
                             + w["efficiency"] * (min(max(as_number(prev.get("rev_efficiency")) or 0, 0) / config["drawdown"]["efficiency_full_at"] * 100, 100)))
            f_before_base.append(prev_base_val)
            f_before_final.append(prev_final_val)

    if f_before_final:
        print(f"  Before: mean base={round(sum(f_before_base)/len(f_before_base),2)}  "
              f"mean final={round(sum(f_before_final)/len(f_before_final),2)}  "
              f"ratio={round(sum(f_before_final)/sum(f_before_base),3) if sum(f_before_base) else 0}")
    if f_after_final:
        print(f"  After:  mean base={round(sum(f_after_base)/len(f_after_base),2)}  "
              f"mean final={round(sum(f_after_final)/len(f_after_final),2)}  "
              f"ratio={round(sum(f_after_final)/sum(f_after_base),3) if sum(f_after_base) else 0}")

    # Top 5 F by composite
    f_after_names.sort(key=lambda x: -(x[1] or 0))
    print(f"  Top 5 F by composite (after):")
    for ticker, comp in f_after_names[:5]:
        rev = after_scores.get(ticker) or {}
        print(f"    {ticker}: composite={comp}  quality={rev.get('rev_quality')}  "
              f"dq={rev.get('rev_data_quality')}  conf={rev.get('rev_route_confidence')}  "
              f"imp={rev.get('rev_impairment_prob')}  surv={rev.get('rev_survivability')}")

    # --- Mean composite per archetype before/after ---
    print("\n--- Mean composite by archetype before/after ---")
    before_mean_comp = {}
    after_mean_comp = {}
    for ticker, prev in previous_scores.items():
        arch = prev.get("rev_archetype")
        comp = as_number(prev.get("rev_composite"))
        if arch and comp is not None and prev.get("rev_band") not in ("Excluded", "Reject", None):
            before_mean_comp.setdefault(arch, []).append(comp)
    for stock in stocks:
        rev = stock.get("reverse") or {}
        arch = rev.get("rev_archetype")
        comp = as_number(rev.get("rev_composite"))
        if arch and comp is not None and rev.get("rev_band") not in ("Excluded", "Reject", None):
            after_mean_comp.setdefault(arch, []).append(comp)

    for arch in sorted(set(list(before_mean_comp.keys()) + list(after_mean_comp.keys()))):
        bm = round(sum(before_mean_comp.get(arch, [])) / len(before_mean_comp[arch]), 2) if before_mean_comp.get(arch) else None
        am = round(sum(after_mean_comp.get(arch, [])) / len(after_mean_comp[arch]), 2) if after_mean_comp.get(arch) else None
        print(f"  {arch}: {bm or 'N/A'} → {am or 'N/A'}")

    # --- Band distribution before/after ---
    print("\n--- Band distribution before/after ---")
    before_bands = {}
    after_bands = {}
    for prev in previous_scores.values():
        band = prev.get("rev_band")
        if band and band not in ("Excluded", "Reject"):
            before_bands[band] = before_bands.get(band, 0) + 1
    for stock in stocks:
        rev = stock.get("reverse") or {}
        band = rev.get("rev_band")
        if band and band not in ("Excluded", "Reject"):
            after_bands[band] = after_bands.get(band, 0) + 1
    for band in ["High", "Solid", "Watchlist", "Monitor", "Reject-tier"]:
        b = before_bands.get(band, 0)
        a = after_bands.get(band, 0)
        print(f"  {band}: {b} → {a}")

    # --- SPOT: TSM + PCVX full breakdowns ---
    print("\n--- SPOT CHECK: TSM + PCVX ---")
    for spot_ticker in ("TSM", "PCVX"):
        spot_stock = next((s for s in stocks if s["symbol"] == spot_ticker), None)
        if spot_stock is None:
            print(f"  {spot_ticker}: NOT FOUND")
            continue
        spot_rev = spot_stock.get("reverse") or {}
        if spot_rev.get("rev_band") in ("Excluded", "Reject"):
            print(f"  {spot_ticker}: {spot_rev.get('rev_band')} — {spot_rev.get('rev_con')}")
            continue

        w = config["composite"]["weights"]
        cagr_s = min(max((as_number(spot_rev.get("rev_cagr_proxy")) or 0) / config["cagr"]["cagr_score_full_at"] * 100, 0), 100)
        if "GROWTH_UNVERIFIED" in (spot_rev.get("rev_flags") or ""):
            cagr_s = min(cagr_s, 60)
        mos_s = as_number(spot_rev.get("rev_mos")) or 0
        qual_s = as_number(spot_rev.get("rev_quality")) or 0
        surv_s = as_number(spot_rev.get("rev_survivability")) or 0
        eff = max(as_number(spot_rev.get("rev_efficiency")) or 0, 0)
        eff_s = min(eff / config["drawdown"]["efficiency_full_at"] * 100, 100)
        base_val = (w["cagr"] * cagr_s + w["mos"] * mos_s + w["quality"] * qual_s
                    + w["survivability"] * surv_s + w["efficiency"] * eff_s)

        print(f"\n  {spot_ticker} | Archetype: {spot_rev.get('rev_archetype')} | "
              f"Confidence: {spot_rev.get('rev_route_confidence')} | DQ: {spot_rev.get('rev_data_quality')}")
        print(f"    Sub-scores: CAGR={round(cagr_s,1)} MoS={mos_s} Quality={qual_s} Survivability={surv_s} Efficiency={round(eff_s,1)}")
        print(f"    Base composite: {round(base_val, 2)}")

        hc_product = 1.0
        hc_steps = []
        if (spot_rev.get("rev_impairment_prob") or 0) > 0.20:
            hc_product *= 0.50
            hc_steps.append(f"impairment*0.50 (prob={spot_rev.get('rev_impairment_prob')})")
        if (spot_rev.get("rev_data_quality") or 0) < 3:
            hc_product *= 0.70
            hc_steps.append(f"dq*0.70 (dq={spot_rev.get('rev_data_quality')})")
        if spot_rev.get("rev_route_confidence") == "low":
            if (spot_rev.get("rev_data_quality") or 0) < 3:
                hc_steps.append("low-conf*0.85 SUPPRESSED (dq<3, correlated)")
            else:
                hc_product *= 0.85
                hc_steps.append("low-conf*0.85")
        if "HIGH_GROWTH_UNVERIFIED" in (spot_rev.get("rev_flags") or ""):
            hc_product *= 0.75
            hc_steps.append("HIGH_GROWTH_UNVERIFIED*0.75")
        pre_floor = base_val * hc_product
        if hc_product < 0.35:
            hc_steps.append(f"FLOOR 0.35x (would be {hc_product:.3f}x → {pre_floor:.1f})")
            final_val = base_val * 0.35
        else:
            final_val = pre_floor
        print(f"    Haircuts: {' → '.join(hc_steps)}")
        print(f"    Final: {round(final_val, 2)} | Stored: {spot_rev.get('rev_composite')}")
        print(f"    CAGR proxy: {spot_rev.get('rev_cagr_proxy')}% | Efficiency: {spot_rev.get('rev_efficiency')}")
        print(f"    Flags: {spot_rev.get('rev_flags')}")


if __name__ == "__main__":
    main()
