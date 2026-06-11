"""run_chain.py — enforced scoring chain with data-integrity invariants.

Order: (optional) fetch_macro_state --apply -> score_reverse -> score_paradigm
-> invariant checks -> chain_manifest.json + reverse nomination forward log.

Why this exists: the daily fetch regenerates stocks.json WITHOUT re-running
score_reverse.py, which left the dashboard and the paradigm economics gate on
stale reverse data (72 of 6,602 stocks merged; May 24 scores under June 7
prices). This script makes the ordering explicit and fails loudly when any
artifact is stale, missing, or shrunken.

Usage:
    python scripts/run_chain.py               # macro -> reverse -> paradigm
    python scripts/run_chain.py --skip-macro  # offline: reverse -> paradigm

Exit code: 0 = all steps ran and all HARD invariants passed.
           1 = a step failed or a HARD invariant failed (soft ones only warn).
"""

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
REVERSE_SCORES_JSON = DATA / "reverse_scores.json"
PARADIGM_SCORES_JSON = DATA / "paradigm_scores.json"
THEME_METRICS_JSON = DATA / "paradigm_theme_metrics.json"
MANIFEST_JSON = DATA / "chain_manifest.json"
NOMINATION_LOG_JSONL = DATA / "reverse_nomination_log.jsonl"

# Invariant thresholds
MIN_REVERSE_COVERAGE = 0.90   # share of stocks that must carry a reverse object
MIN_NOMINATED = 1             # Stage 9 must nominate at least this many
MAX_UNIVERSE_DRIFT = 0.10     # vs previous manifest
MAX_THEME_DRIFT = 0.50        # tagged_count swing vs previous manifest (hot flips are legal but loud)
MAX_STOCKS_AGE_DAYS = 8       # stocks.json older than this = fetch pipeline broken


def load_json(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def run_step(name, args, steps, env_note=""):
    print(f"\n=== STEP: {name} {env_note}".ljust(60, "="))
    t0 = time.monotonic()
    proc = subprocess.run([sys.executable, *args], cwd=ROOT)
    duration = round(time.monotonic() - t0, 1)
    steps.append({"name": name, "returncode": proc.returncode, "duration_s": duration})
    print(f"=== STEP DONE: {name} rc={proc.returncode} ({duration}s)")
    return proc.returncode == 0


def add_invariant(invariants, name, level, ok, detail):
    invariants.append({"name": name, "level": level, "ok": bool(ok), "detail": detail})
    tag = "PASS" if ok else ("FAIL" if level == "hard" else "WARN")
    print(f"  [{tag}] ({level}) {name}: {detail}")


def main():
    parser = argparse.ArgumentParser(description="Run the scoring chain with invariants.")
    parser.add_argument("--skip-macro", action="store_true",
                        help="Skip the FRED macro fetch (offline / no API key).")
    args = parser.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    chain_start = time.time()
    steps = []
    invariants = []

    previous_manifest = {}
    if MANIFEST_JSON.exists():
        try:
            previous_manifest = load_json(MANIFEST_JSON)
        except Exception:
            previous_manifest = {}

    # ── Preflight ────────────────────────────────────────────────────────
    print(f"run_chain {run_id}")
    if not STOCKS_JSON.exists():
        print("FATAL: stocks.json missing — run fetch_data.py first.")
        sys.exit(1)

    stocks_age_days = (time.time() - STOCKS_JSON.stat().st_mtime) / 86400
    add_invariant(invariants, "stocks_json_fresh", "soft",
                  stocks_age_days <= MAX_STOCKS_AGE_DAYS,
                  f"stocks.json is {stocks_age_days:.1f} days old (max {MAX_STOCKS_AGE_DAYS})")

    # ── Steps ────────────────────────────────────────────────────────────
    ok = True
    if not args.skip_macro:
        # Macro overlay is non-load-bearing; tolerate failure with a warning.
        macro_ok = run_step("fetch_macro_state", ["scripts/fetch_macro_state.py", "--apply"], steps)
        add_invariant(invariants, "macro_fetch", "soft", macro_ok,
                      "FRED macro state fetched" if macro_ok else "macro fetch failed (flags will be stale)")

    if not run_step("score_reverse", ["scripts/score_reverse.py"], steps):
        print("FATAL: score_reverse failed — aborting before paradigm.")
        ok = False
    if ok and not run_step("score_paradigm", ["scripts/score_paradigm.py"], steps):
        print("FATAL: score_paradigm failed.")
        ok = False
    if ok and not run_step("score_factors", ["scripts/score_factors.py"], steps):
        print("FATAL: score_factors failed.")
        ok = False
    if ok and not run_step("build_valuation_models", ["scripts/build_valuation_models.py"], steps):
        print("FATAL: build_valuation_models failed.")
        ok = False

    # ── Post-run invariants (artifact-based, not stdout-parsed) ─────────
    print("\n=== INVARIANTS ".ljust(60, "="))
    n_stocks = None
    if ok:
        stocks = load_json(STOCKS_JSON)
        n_stocks = len(stocks)

        prev_n = previous_manifest.get("counts", {}).get("stocks")
        if prev_n:
            drift = abs(n_stocks - prev_n) / prev_n
            add_invariant(invariants, "universe_drift", "soft", drift <= MAX_UNIVERSE_DRIFT,
                          f"universe {prev_n} -> {n_stocks} ({drift:.1%} drift, max {MAX_UNIVERSE_DRIFT:.0%})")

        with_reverse = sum(1 for s in stocks if s.get("reverse"))
        coverage = with_reverse / n_stocks if n_stocks else 0
        add_invariant(invariants, "reverse_coverage", "hard", coverage >= MIN_REVERSE_COVERAGE,
                      f"{with_reverse}/{n_stocks} stocks carry reverse object ({coverage:.1%}, min {MIN_REVERSE_COVERAGE:.0%})")

        add_invariant(invariants, "reverse_scores_regenerated", "hard",
                      REVERSE_SCORES_JSON.stat().st_mtime >= chain_start,
                      "reverse_scores.json written by this run")

        reverse_scores = load_json(REVERSE_SCORES_JSON)
        nominated = [
            {"symbol": sym,
             "rev_composite": rv.get("rev_composite"),
             "rev_rank": rv.get("rev_rank"),
             "rev_archetype": rv.get("rev_archetype"),
             "rev_band": rv.get("rev_band")}
            for sym, rv in reverse_scores.items()
            if isinstance(rv, dict) and rv.get("rev_nominated")
        ]
        add_invariant(invariants, "nomination_nonempty", "hard", len(nominated) >= MIN_NOMINATED,
                      f"{len(nominated)} stocks nominated (min {MIN_NOMINATED})")

        add_invariant(invariants, "paradigm_scores_regenerated", "hard",
                      PARADIGM_SCORES_JSON.exists() and PARADIGM_SCORES_JSON.stat().st_mtime >= chain_start,
                      "paradigm_scores.json written by this run")

        paradigm_scores = load_json(PARADIGM_SCORES_JSON)
        add_invariant(invariants, "paradigm_coverage", "hard", len(paradigm_scores) >= 0.95 * n_stocks,
                      f"{len(paradigm_scores)} paradigm rows vs {n_stocks} stocks")

        factor_path = DATA / "factor_scores.json"
        factor = load_json(factor_path) if factor_path.exists() else {}
        fct_scored = factor.get("scored_count", 0)
        add_invariant(invariants, "factor_scored", "hard", fct_scored >= 500,
                      f"{fct_scored} stocks carry a Factor Lab score (min 500)")
        research_now = factor.get("band_counts", {}).get("research_now", 0)
        add_invariant(invariants, "factor_research_now", "soft", research_now >= 10,
                      f"{research_now} research_now candidates")

        valuation_path = DATA / "valuation_models.json"
        valuation = load_json(valuation_path) if valuation_path.exists() else {}
        add_invariant(invariants, "valuation_models", "soft",
                      valuation.get("modeled_count", 0) >= 50,
                      f"{valuation.get('modeled_count', 0)} reverse-DCF models built")

        # ── Factor Lab forward log (dated, append-only — outcome tracking) ──
        factor_log = DATA / "factor_signal_log.jsonl"
        log_rows = [
            {"symbol": sym, "fct_composite": e.get("fct_composite"),
             "fct_rank": e.get("fct_rank"), "fct_band": e.get("fct_band")}
            for sym, e in (factor.get("tickers") or {}).items()
            if e.get("fct_band") in ("research_now", "watchlist")
        ]
        with factor_log.open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "run_id": run_id,
                "snapshot_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "engine": factor.get("engine", "factor_lab_v1"),
                "signals": sorted(log_rows, key=lambda x: (x.get("fct_rank") or 10**9)),
            }, sort_keys=True) + "\n")
        print(f"  Appended {len(log_rows)} factor signals to {factor_log.name}")

        # Theme membership drift vs previous run (hot flips are legal but must be visible)
        theme_counts = {}
        if THEME_METRICS_JSON.exists():
            tm = load_json(THEME_METRICS_JSON).get("themes", {})
            theme_counts = {tid: m.get("tagged_count") for tid, m in tm.items()}
            prev_themes = previous_manifest.get("counts", {}).get("themes", {})
            for tid, count in theme_counts.items():
                prev = prev_themes.get(tid)
                if prev and prev > 0 and count is not None:
                    tdrift = abs(count - prev) / prev
                    if tdrift > MAX_THEME_DRIFT:
                        hot_now = tm.get(tid, {}).get("hot")
                        add_invariant(invariants, f"theme_drift_{tid}", "soft", False,
                                      f"tagged {prev} -> {count} ({tdrift:.0%}); hot={hot_now}")

        # ── Reverse nomination forward log (dated, append-only) ─────────
        snapshot = {
            "run_id": run_id,
            "snapshot_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "nominated": sorted(nominated, key=lambda x: (x.get("rev_rank") or 10**9)),
        }
        with NOMINATION_LOG_JSONL.open("a", encoding="utf-8") as f:
            f.write(json.dumps(snapshot, sort_keys=True) + "\n")
        print(f"  Appended {len(nominated)} nominations to {NOMINATION_LOG_JSONL.name}")

    hard_failed = [i for i in invariants if i["level"] == "hard" and not i["ok"]]
    soft_failed = [i for i in invariants if i["level"] == "soft" and not i["ok"]]
    chain_ok = ok and not hard_failed

    manifest = {
        "run_id": run_id,
        "finished_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ok": chain_ok,
        "steps": steps,
        "invariants": invariants,
        "counts": {
            "stocks": n_stocks,
            "themes": theme_counts if ok else {},
        },
    }
    with MANIFEST_JSON.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write("\n")

    print(f"\n=== CHAIN {'OK' if chain_ok else 'FAILED'} "
          f"(hard fails: {len(hard_failed)}, warnings: {len(soft_failed)}) — manifest written")
    sys.exit(0 if chain_ok else 1)


if __name__ == "__main__":
    main()
