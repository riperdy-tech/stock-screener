"""audit_data.py - plausibility audit over the fetched data artifacts.

Why this exists: chain_manifest's invariants check COVERAGE and REGENERATION -
did every stock get a reverse object, was paradigm_scores.json written by this
run. They never ask whether the numbers inside are possible. A run where every
foreign ADR's P/S is off by 200x because filing-currency revenue was divided by
a USD market cap passes all of them and reports green.

This is the missing layer: assertions of the form "this cannot be true",
deliberately loose so that anything firing is a real defect and not a tail.

READ-ONLY BY DESIGN. Writes no file, opens no socket, imports nothing outside
the stdlib. Nothing in the pipeline calls it and it is safe to run at any time,
including while a scheduled fetch is mid-flight.

Usage:
    python scripts/audit_data.py                 # human-readable report
    python scripts/audit_data.py --json          # machine-readable findings
    python scripts/audit_data.py --fail-on high  # exit 1 if any HIGH fired
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
from datetime import date, datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"

# Domiciles whose filing currency is >=10x smaller per unit than USD. A ratio
# built as (USD market cap) / (filing-currency revenue) collapses toward zero
# for these, which reads downstream as "extremely cheap" rather than "broken".
WEAK_CCY = {"South Korea", "Japan", "Colombia", "Vietnam", "Chile", "Indonesia",
            "Hungary", "Iceland", "Costa Rica", "Nigeria", "Sri Lanka"}

# Artifact -> age budget in days. Budgets are generous; a breach means the
# producing job has been silently failing, not that it ran a little late.
AGE_BUDGETS = {
    "fundamentals_history.json": 10,
    "fundamentals_battery.json": 10,
    "factor_scores.json": 8,
    "price_history.json": 8,
    "analyst_coverage.json": 14,
    "overlay_signals.json": 10,
}

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}

_findings: list[dict] = []


def add(severity: str, check: str, detail: str, sample=None) -> None:
    _findings.append({"severity": severity, "check": check, "detail": detail,
                      "sample": [str(s) for s in (sample or [])][:12]})


def load(name: str):
    p = DATA / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        add("high", "unparseable_artifact", f"{name} could not be parsed: {e}")
        return None


def met(row: dict, key: str):
    return (row.get("metrics") or {}).get(key)


def is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def is_foreign(country) -> bool:
    return country not in ("United States", None, "Unknown")


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------

def check_dead_columns(stocks: list[dict]) -> None:
    """A column carrying one distinct value across the whole universe is not a
    measurement. It is still emitted, joined and rendered as if it were."""
    n = len(stocks)
    columns = {
        "peRatio": lambda r: r.get("peRatio"),
        "metrics.netIncome": lambda r: met(r, "netIncome"),
        "metrics.operatingCashFlow": lambda r: met(r, "operatingCashFlow"),
        "metrics.dilution": lambda r: met(r, "dilution"),
        "metrics.mScore": lambda r: met(r, "mScore"),
        "metrics.consecutiveGrowth": lambda r: met(r, "consecutiveGrowth"),
    }
    for label, getter in columns.items():
        vals = [getter(r) for r in stocks]
        distinct = {v for v in vals if v is not None}
        nulls = sum(1 for v in vals if v is None)
        if not distinct:
            add("high", "dead_column",
                f"{label} is null for all {n} rows")
        elif len(distinct) == 1:
            add("high", "dead_column",
                f"{label} is the constant {distinct.pop()!r} on every non-null row "
                f"({n - nulls}/{n} populated) - the field carries no information "
                f"but is emitted and consumed as if it did")


def check_currency_units(stocks: list[dict]) -> None:
    """USD market cap over filing-currency fundamentals. No FX layer exists."""
    n = len(stocks)

    mismatched = [r["symbol"] for r in stocks
                  if is_num(met(r, "ocf")) and is_num(r.get("marketCap"))
                  and r["marketCap"] > 0
                  and abs(met(r, "ocf")) / r["marketCap"] > 5]
    if mismatched:
        add("high", "currency_unit_mismatch",
            f"{len(mismatched)} rows ({len(mismatched)/n:.1%}) report |operating cash "
            f"flow| > 5x market cap - filing-currency statements divided by a USD "
            f"market cap", mismatched)

    def median_ps(pred):
        vals = [met(r, "psRatio") for r in stocks
                if pred(r.get("country")) and is_num(met(r, "psRatio")) and met(r, "psRatio") > 0]
        return (statistics.median(vals), len(vals)) if vals else (None, 0)

    us_ps, us_n = median_ps(lambda c: c == "United States")
    weak_ps, weak_n = median_ps(lambda c: c in WEAK_CCY)
    if us_ps and weak_ps and us_ps / weak_ps > 5:
        add("high", "ps_ratio_currency_skew",
            f"median P/S is {us_ps:.2f} for US names (n={us_n}) but {weak_ps:.4f} for "
            f"weak-currency domiciles (n={weak_n}) - a {us_ps/weak_ps:.0f}x gap that no "
            f"real valuation spread produces; those names are scored as artificially cheap")

    big_cheap = [r["symbol"] for r in stocks
                 if is_num(met(r, "psRatio")) and 0 < met(r, "psRatio") < 0.05
                 and is_num(r.get("marketCap")) and r["marketCap"] > 1e9]
    if big_cheap:
        add("high", "implausible_ps",
            f"{len(big_cheap)} companies above $1B market cap show P/S < 0.05, which "
            f"implies revenue above 20x market cap", big_cheap)


def check_verdict_price_split(stocks: list[dict]) -> None:
    """The screen's pass/fail reasons quote the price they were evaluated at.
    When that disagrees with the stored price, the verdict and the number on
    screen came from different snapshots and the score is unfalsifiable."""
    pat = re.compile(r"Price \$([0-9,.]+)")
    quoting = 0
    drifted = []
    for r in stocks:
        for reason in (r.get("reasons") or []):
            m = pat.search(reason)
            if not m:
                continue
            quoting += 1
            try:
                quoted = float(m.group(1).replace(",", ""))
            except ValueError:
                break
            stored = r.get("price") or 0
            if quoted > 0 and stored > 0 and abs(stored - quoted) / quoted > 0.005:
                drifted.append(r["symbol"])
            break
    if quoting and len(drifted) / quoting > 0.05:
        add("high", "verdict_price_mismatch",
            f"{len(drifted)}/{quoting} ({len(drifted)/quoting:.0%}) of rows have their "
            f"pass/fail reasons - and therefore score, status and failCodes - computed "
            f"against a different price than the one stored", drifted)

    add("medium", "stale_derived_ratios",
        "refresh_prices.py rescales price, marketCap and monthlyCloses[-1] but leaves "
        "psRatio, priceToBook, pegRatio, fiveYearAveragePe and monthlyMa20 on the "
        "pre-refresh price, so each of those is inconsistent with the marketCap in its "
        "own row (structural - reported unconditionally, not measured)")


def check_row_staleness(stocks: list[dict], today: date) -> None:
    def age(r):
        try:
            stamp = str(r.get("Last_Updated"))[:10]
            return (today - datetime.strptime(stamp, "%Y-%m-%d").date()).days
        except Exception:
            return None

    aged = [(age(r), r) for r in stocks]
    for threshold, severity in ((30, "high"), (7, "medium")):
        stale = [r["symbol"] for a, r in aged if a is not None and a > threshold]
        if stale:
            add(severity, f"stale_rows_{threshold}d",
                f"{len(stale)} rows have not been re-fetched in over {threshold} days "
                f"but are still scored, ranked and served", stale)
    unparseable = [r["symbol"] for a, r in aged if a is None]
    if unparseable:
        add("medium", "unparseable_last_updated",
            f"{len(unparseable)} rows have a missing or unparseable Last_Updated",
            unparseable)


def check_impossible_scalars(stocks: list[dict]) -> None:
    n = len(stocks)
    rules = [
        ("medium", "zero_price", "carry price = 0",
         lambda r: r.get("price") == 0),
        ("medium", "zero_market_cap", "carry marketCap = 0",
         lambda r: r.get("marketCap") == 0),
        ("medium", "implausible_market_cap", "report a market cap under $1M",
         lambda r: is_num(r.get("marketCap")) and 0 < r["marketCap"] < 1e6),
        ("medium", "insider_ownership_scale",
         "report insider ownership above 100% - percent/fraction mixing in a field "
         "the screen gates at < 0.15",
         lambda r: is_num(met(r, "insiderOwnership")) and met(r, "insiderOwnership") > 1.0),
        ("medium", "gross_margin_over_100", "report gross margin above 100%",
         lambda r: is_num(met(r, "grossMargin")) and met(r, "grossMargin") > 1.0),
        ("medium", "negative_price", "report a negative price",
         lambda r: is_num(r.get("price")) and r["price"] < 0),
    ]
    for severity, check, phrase, pred in rules:
        hits = [r["symbol"] for r in stocks if pred(r)]
        if hits:
            add(severity, check, f"{len(hits)} rows ({len(hits)/n:.1%}) {phrase}", hits)


def check_missing_skips_gate(stocks: list[dict]) -> None:
    """is_potential_100_bagger compares attributes that default to 0.0. Where the
    test is `>` or a ratio against another zero, a MISSING input skips the fail
    check entirely and the row gains 10 points, since score = 100 - 10*len(reasons)."""
    n = len(stocks)
    free = [r["symbol"] for r in stocks
            if met(r, "grossMargin") in (0, None)
            and "FAIL_GM_TREND" not in set(r.get("failCodes") or [])]
    if free:
        add("medium", "missing_data_skips_gate",
            f"{len(free)} rows ({len(free)/n:.0%}) skip the FAIL_GM_TREND check because "
            f"the input is 0 rather than null; each skip adds 10 points to score", free)


def check_thin_history(stocks: list[dict]) -> None:
    n = len(stocks)
    thin = [r["symbol"] for r in stocks if len(met(r, "monthlyCloses") or []) < 24]
    if thin:
        add("medium", "thin_price_history",
            f"{len(thin)} rows ({len(thin)/n:.0%}) have fewer than 24 monthly closes, so "
            f"momentum, MA20 and the drawdown proxy run on a short window", thin)


def check_internal_invariants(stocks: list[dict]) -> None:
    """These held at the time of writing. They are cheap and catch a whole class
    of regression in the scoring writer, so they are asserted rather than assumed."""
    bad_score = [r["symbol"] for r in stocks
                 if r.get("score") != max(0, 100 - 10 * len(r.get("reasons") or []))]
    if bad_score:
        add("high", "score_formula_broken",
            f"{len(bad_score)} rows violate score == 100 - 10*len(reasons)", bad_score)

    bad_status = [r["symbol"] for r in stocks
                  if (r.get("status") == "Pass") != (len(r.get("failCodes") or []) == 0)]
    if bad_status:
        add("high", "status_failcodes_disagree",
            f"{len(bad_status)} rows are marked Pass while carrying failCodes, or vice "
            f"versa", bad_status)

    seen, dupes = set(), []
    for r in stocks:
        s = r.get("symbol")
        if s in seen:
            dupes.append(s)
        seen.add(s)
    if dupes:
        add("high", "duplicate_symbols",
            f"{len(dupes)} duplicate symbols in stocks.json", dupes)


def check_nomination_skew(stocks: list[dict]) -> None:
    """A funnel that concentrates one domicile far above its universe weight is
    usually selecting on a data defect shared by that group, not on edge."""
    n = len(stocks)
    nominated = [r for r in stocks if (r.get("reverse") or {}).get("rev_nominated")]
    if not nominated:
        return
    uni_share = sum(1 for r in stocks if is_foreign(r.get("country"))) / n
    nom_share = sum(1 for r in nominated if is_foreign(r.get("country"))) / len(nominated)
    if uni_share and nom_share > uni_share * 2:
        add("high", "nomination_domicile_skew",
            f"non-US names are {uni_share:.0%} of the universe but {nom_share:.0%} of the "
            f"{len(nominated)} nominations ({nom_share/uni_share:.1f}x over-represented), "
            f"which is what the currency defect would produce",
            [r["symbol"] for r in nominated if is_foreign(r.get("country"))])


def check_join_integrity(stocks: list[dict]) -> None:
    """Scores keyed on symbols absent from the universe are orphans nothing renders."""
    syms = {r["symbol"] for r in stocks}
    for name, key, min_cov in [("reverse_scores.json", None, 0.90),
                               ("paradigm_scores.json", None, 0.90),
                               ("factor_scores.json", "tickers", 0.90),
                               ("price_history.json", "prices", 0.85)]:
        doc = load(name)
        if doc is None:
            add("high", "missing_artifact", f"{name} does not exist")
            continue
        keys = set(doc.get(key) or {}) if key else {
            k for k in doc if not k.startswith("_")
            and k not in ("generated_at", "meta", "config", "run_id", "finished_at")}
        if not keys:
            add("high", "empty_artifact", f"{name} contains no ticker keys")
            continue
        coverage = len(keys & syms) / len(syms)
        orphans = keys - syms
        if coverage < min_cov:
            add("high", "low_join_coverage",
                f"{name} covers only {coverage:.1%} of the universe (budget {min_cov:.0%})")
        if orphans:
            add("medium", "join_orphans",
                f"{name} has {len(orphans)} keys absent from stocks.json",
                sorted(orphans))


def check_artifact_freshness(today: date) -> None:
    """The producing workflows use `|| true`, so a crashed step leaves the previous
    file in place and the run still reports success. The internal stamp is the
    only thing that reveals it."""
    for name, budget in AGE_BUDGETS.items():
        p = DATA / name
        if not p.exists():
            add("high", "missing_artifact", f"{name} does not exist")
            continue
        doc = load(name)
        stamp = None
        if isinstance(doc, dict):
            for k in ("generated_at", "fetched_at", "finished_at", "snapshot_date"):
                if doc.get(k):
                    stamp = str(doc[k])
                    break
        age = None
        if stamp:
            try:
                age = (today - datetime.fromisoformat(
                    stamp.replace("Z", "+00:00")).date()).days
            except Exception:
                age = None
        source = f"stamp={stamp}"
        if age is None:
            age = (today - date.fromtimestamp(p.stat().st_mtime)).days
            source = "mtime (no internal stamp)"
        if age > budget:
            add("high", "stale_artifact",
                f"{name} is {age} days old against a {budget}-day budget ({source}); "
                f"consumers cannot tell and the workflow reports success either way")


# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--json", action="store_true",
                    help="emit findings as JSON instead of a report")
    ap.add_argument("--fail-on", choices=["high", "medium", "low"], default=None,
                    help="exit 1 when a finding at this severity or above fired")
    args = ap.parse_args()

    stocks = load("stocks.json")
    if not stocks:
        print(f"stocks.json not found under {DATA}", file=sys.stderr)
        return 2

    today = date.today()
    check_dead_columns(stocks)
    check_currency_units(stocks)
    check_verdict_price_split(stocks)
    check_row_staleness(stocks, today)
    check_impossible_scalars(stocks)
    check_missing_skips_gate(stocks)
    check_thin_history(stocks)
    check_internal_invariants(stocks)
    check_nomination_skew(stocks)
    check_join_integrity(stocks)
    check_artifact_freshness(today)

    _findings.sort(key=lambda f: (SEVERITY_ORDER[f["severity"]], f["check"]))

    if args.json:
        print(json.dumps({"generated_at": datetime.now().isoformat(timespec="seconds"),
                          "universe": len(stocks),
                          "findings": _findings}, indent=2))
    else:
        counts = {s: sum(1 for f in _findings if f["severity"] == s)
                  for s in ("high", "medium", "low")}
        print(f"\ndata audit - {len(stocks)} rows in stocks.json")
        print(f"{len(_findings)} findings "
              f"({counts['high']} high, {counts['medium']} medium, {counts['low']} low)")
        print("=" * 74)
        for f in _findings:
            print(f"\n[{f['severity'].upper():6s}] {f['check']}")
            print(f"  {f['detail']}")
            if f["sample"]:
                print(f"  e.g. {', '.join(f['sample'])}")
        if not _findings:
            print("\n  no findings")
        print()

    if args.fail_on:
        threshold = SEVERITY_ORDER[args.fail_on]
        if any(SEVERITY_ORDER[f["severity"]] <= threshold for f in _findings):
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
