"""dual_door_diff.py — Diagnostic measurement harness for Tier 2 Dual-Door Sifter.

Compares two sifter implementations on the SAME inputs without writing to public/data:
1. Baseline: loaded from a git ref (default: merge-base with origin/main) or an override file.
2. Working tree: loaded from the current working tree file (scripts/score_factors_dual_door.py).

Outputs:
- JSON report (--out path, default: a temporary file)
- Human-readable text summary printed to stdout

Zero side-effects:
- OUT_JSON and FACTOR_SCORES_COMPAT_JSON are redirected to a temporary directory.
- mri_sync snapshot writes are suppressed / stubbed.
- public/data is never modified.
"""

import argparse
import io
import json
import math
import os
import subprocess
import sys
import tempfile
import types
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Repository navigation
TOOLS_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = TOOLS_DIR.parent
ROOT = SCRIPTS_DIR.parent
DEFAULT_DATA_DIR = ROOT / "public" / "data"
DEFAULT_SIFTER_PATH = SCRIPTS_DIR / "score_factors_dual_door.py"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


def resolve_baseline_ref(repo_root: Path, ref_override: Optional[str] = None) -> str:
    """Find the baseline git ref. Defaults to merge-base with origin/main."""
    if ref_override:
        return ref_override
    # 1. Try git merge-base HEAD origin/main
    try:
        res = subprocess.run(
            ["git", "merge-base", "HEAD", "origin/main"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            check=True,
        )
        base = res.stdout.strip()
        if base:
            return base
    except Exception:
        pass
    # 2. Try origin/main
    try:
        res = subprocess.run(
            ["git", "rev-parse", "origin/main"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            check=True,
        )
        base = res.stdout.strip()
        if base:
            return base
    except Exception:
        pass
    # 3. Fallback to HEAD
    res = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=True,
    )
    return res.stdout.strip()


def get_git_file_content(repo_root: Path, ref: str, file_rel_path: str = "scripts/score_factors_dual_door.py") -> str:
    """Read a file's content from a given git ref via git show."""
    res = subprocess.run(
        ["git", "show", f"{ref}:{file_rel_path}"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=True,
    )
    return res.stdout


def load_sifter_module(source_code: str, module_name: str, sifter_path: Path) -> types.ModuleType:
    """Compile and load source code into an isolated module instance."""
    mod = types.ModuleType(module_name)
    mod.__file__ = str(sifter_path.resolve())
    compiled = compile(source_code, mod.__file__, "exec")
    exec(compiled, mod.__dict__)
    return mod


def run_sifter(
    mod: types.ModuleType,
    output_dir: Path,
    data_dir: Optional[Path] = None,
    quiet: bool = True,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Execute sifter main() with outputs redirected to output_dir.
    
    Guarantees that public/data is never modified.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    out_json = output_dir / "factor_scores_dual_door.json"
    compat_json = output_dir / "factor_scores.json"

    # Redirect outputs
    mod.OUT_JSON = out_json
    mod.FACTOR_SCORES_COMPAT_JSON = compat_json

    # Suppress mri_sync snapshot copying to public/data/mri
    mod.sync_mri_snapshot = lambda: None

    # Redirect inputs if custom data_dir is provided
    if data_dir is not None:
        data_dir = data_dir.resolve()
        mod.DATA = data_dir
        mod.STOCKS_JSON = data_dir / "stocks.json"
        mod.PRICE_HISTORY_JSON = data_dir / "price_history.json"
        mod.FUNDAMENTALS_HISTORY_JSON = data_dir / "fundamentals_history.json"
        mod.BATTERY_JSON = data_dir / "fundamentals_battery.json"
        mod.EPS_TRAJECTORY_JSON = data_dir / "eps_trajectory.json"
        mod.TIER1_SURVIVORS_JSON = data_dir / "tier1_hygiene_survivors.json"
        mod.MRI_SNAPSHOT_SECTOR_RANKING_JSON = data_dir / "mri" / "current_sector_ranking.json"
        mod.MOMENTUM_STATE_JSON = data_dir / "momentum_state.json"

    buf_stdout = io.StringIO()
    buf_stderr = io.StringIO()
    try:
        if quiet:
            with redirect_stdout(buf_stdout), redirect_stderr(buf_stderr):
                mod.main()
        else:
            mod.main()
    except Exception as exc:
        err_msg = (
            f"Error executing {mod.__name__}.main(): {exc}\n"
            f"Stdout:\n{buf_stdout.getvalue()}\n"
            f"Stderr:\n{buf_stderr.getvalue()}"
        )
        raise RuntimeError(err_msg) from exc

    if not out_json.exists():
        raise FileNotFoundError(f"Sifter failed to write {out_json}")
    if not compat_json.exists():
        raise FileNotFoundError(f"Sifter failed to write {compat_json}")

    summary = json.loads(out_json.read_text(encoding="utf-8"))
    compat = json.loads(compat_json.read_text(encoding="utf-8"))
    return summary, compat


def pctl(sorted_vals: List[float], q: float) -> Optional[float]:
    """Empirical percentile with linear interpolation matching score_factors_dual_door.py."""
    n = len(sorted_vals)
    if n == 0:
        return None
    if n == 1:
        return sorted_vals[0]
    pos = (q / 100.0) * (n - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, n - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1.0 - frac) + sorted_vals[hi] * frac


def compute_spearman_rank_correlation(x: List[float], y: List[float]) -> Optional[float]:
    """Spearman rank correlation coefficient with midrank tie resolution."""
    if len(x) != len(y) or len(x) == 0:
        return None
    if len(x) == 1:
        return 1.0

    def _rank(vals: List[float]) -> List[float]:
        n = len(vals)
        sorted_indices = sorted(range(n), key=lambda i: vals[i])
        ranks = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j < n - 1 and vals[sorted_indices[j + 1]] == vals[sorted_indices[j]]:
                j += 1
            midrank = (i + 1 + j + 1) / 2.0
            for k in range(i, j + 1):
                ranks[sorted_indices[k]] = midrank
            i = j + 1
        return ranks

    rx = _rank(x)
    ry = _rank(y)
    n = len(rx)
    mean_rx = sum(rx) / n
    mean_ry = sum(ry) / n
    num = sum((rx[i] - mean_rx) * (ry[i] - mean_ry) for i in range(n))
    den_x = sum((rx[i] - mean_rx) ** 2 for i in range(n))
    den_y = sum((ry[i] - mean_ry) ** 2 for i in range(n))
    if den_x <= 0 or den_y <= 0:
        return 1.0 if rx == ry else 0.0
    return round(num / math.sqrt(den_x * den_y), 4)


def compute_distribution_stats(vals: List[float]) -> Dict[str, Any]:
    """Compute distribution metrics for z_momentum among nominees."""
    if not vals:
        return {
            "count": 0,
            "min": None,
            "p10": None,
            "median": None,
            "count_under_minus_1_0": 0,
            "count_under_minus_1_5": 0,
            "count_under_minus_2_0": 0,
        }
    s = sorted(vals)
    return {
        "count": len(s),
        "min": round(s[0], 3),
        "p10": round(pctl(s, 10.0), 3),
        "median": round(pctl(s, 50.0), 3),
        "count_under_minus_1_0": sum(1 for v in s if v < -1.0),
        "count_under_minus_1_5": sum(1 for v in s if v < -1.5),
        "count_under_minus_2_0": sum(1 for v in s if v < -2.0),
    }


def compute_diff(
    baseline_summary: Dict[str, Any],
    baseline_compat: Dict[str, Any],
    working_summary: Dict[str, Any],
    working_compat: Dict[str, Any],
    baseline_label: str = "baseline",
    working_label: str = "working",
) -> Dict[str, Any]:
    """Compute all difference metrics between baseline and working tree results."""
    # 1. Book and Research_Now definitions
    b_tickers_compat = baseline_compat.get("tickers", {})
    w_tickers_compat = working_compat.get("tickers", {})

    b_book = baseline_summary.get("nominated_tickers") or [
        t for t, p in b_tickers_compat.items() if p.get("fct_band") in ("research_now", "watchlist")
    ]
    w_book = working_summary.get("nominated_tickers") or [
        t for t, p in w_tickers_compat.items() if p.get("fct_band") in ("research_now", "watchlist")
    ]

    b_rn = [t for t, p in b_tickers_compat.items() if p.get("fct_band") == "research_now"]
    w_rn = [t for t, p in w_tickers_compat.items() if p.get("fct_band") == "research_now"]

    b_book_set, w_book_set = set(b_book), set(w_book)
    b_rn_set, w_rn_set = set(b_rn), set(w_rn)

    book_entered = sorted(list(w_book_set - b_book_set))
    book_left = sorted(list(b_book_set - w_book_set))
    rn_entered = sorted(list(w_rn_set - b_rn_set))
    rn_left = sorted(list(b_rn_set - w_rn_set))

    # 2. Rank churn (Spearman correlation on common names)
    common_book = sorted(list(b_book_set & w_book_set))
    r_base_book = [b_tickers_compat[t].get("fct_rank") for t in common_book if b_tickers_compat[t].get("fct_rank") is not None]
    r_work_book = [w_tickers_compat[t].get("fct_rank") for t in common_book if w_tickers_compat[t].get("fct_rank") is not None]
    # Filter to cases where both have ranks
    valid_common_book = [
        t for t in common_book
        if b_tickers_compat[t].get("fct_rank") is not None and w_tickers_compat[t].get("fct_rank") is not None
    ]
    r_b_book = [float(b_tickers_compat[t]["fct_rank"]) for t in valid_common_book]
    r_w_book = [float(w_tickers_compat[t]["fct_rank"]) for t in valid_common_book]
    spearman_book = compute_spearman_rank_correlation(r_b_book, r_w_book)

    common_rn = sorted(list(b_rn_set & w_rn_set))
    valid_common_rn = [
        t for t in common_rn
        if b_tickers_compat[t].get("fct_rank") is not None and w_tickers_compat[t].get("fct_rank") is not None
    ]
    r_b_rn = [float(b_tickers_compat[t]["fct_rank"]) for t in valid_common_rn]
    r_w_rn = [float(w_tickers_compat[t]["fct_rank"]) for t in valid_common_rn]
    spearman_rn = compute_spearman_rank_correlation(r_b_rn, r_w_rn)

    # 3. Sector & Cluster mix (book and top 50)
    b_profiles = baseline_summary.get("profiles", {})
    w_profiles = working_summary.get("profiles", {})

    def _get_sec(t: str, profiles: Dict[str, Any], compat: Dict[str, Any]) -> str:
        prof = profiles.get(t) or compat.get("tickers", {}).get(t, {})
        return prof.get("sector") or "Unknown"

    def _get_cluster(t: str, profiles: Dict[str, Any], compat: Dict[str, Any]) -> str:
        prof = profiles.get(t) or compat.get("tickers", {}).get(t, {})
        return prof.get("cluster") or "Unknown"

    def _build_mix(b_list: List[str], w_list: List[str], key_fn) -> Dict[str, Dict[str, int]]:
        b_counts: Dict[str, int] = {}
        for t in b_list:
            k = key_fn(t, b_profiles, baseline_compat)
            b_counts[k] = b_counts.get(k, 0) + 1
        w_counts: Dict[str, int] = {}
        for t in w_list:
            k = key_fn(t, w_profiles, working_compat)
            w_counts[k] = w_counts.get(k, 0) + 1
        all_keys = sorted(set(b_counts.keys()) | set(w_counts.keys()))
        return {
            k: {
                "baseline": b_counts.get(k, 0),
                "working": w_counts.get(k, 0),
                "delta": w_counts.get(k, 0) - b_counts.get(k, 0),
            }
            for k in all_keys
        }

    sector_mix_book = _build_mix(b_book, w_book, _get_sec)
    sector_mix_rn = _build_mix(b_rn, w_rn, _get_sec)
    cluster_mix_book = _build_mix(b_book, w_book, _get_cluster)
    cluster_mix_rn = _build_mix(b_rn, w_rn, _get_cluster)

    # 4. Door mix (book and top 50)
    def _count_doors(tickers_list: List[str], profiles: Dict[str, Any], compat: Dict[str, Any]) -> Dict[str, int]:
        counts: Dict[str, int] = {
            "DOOR_1_COMPOUNDER": 0,
            "DOOR_2_VALUE_GAP": 0,
            "DOUBLE_DOOR_CHAMPION": 0,
            "GLOBAL_WILDCARD": 0,
        }
        for t in tickers_list:
            prof = profiles.get(t) or compat.get("tickers", {}).get(t, {})
            doors = prof.get("nominated_doors") or prof.get("fct_nominated_doors") or []
            for d in doors:
                if d in counts:
                    counts[d] += 1
                else:
                    counts[d] = counts.get(d, 0) + 1
        return counts

    b_doors_book = _count_doors(b_book, b_profiles, baseline_compat)
    w_doors_book = _count_doors(w_book, w_profiles, working_compat)
    all_door_keys_book = sorted(set(b_doors_book.keys()) | set(w_doors_book.keys()))
    door_mix_book = {
        d: {
            "baseline": b_doors_book.get(d, 0),
            "working": w_doors_book.get(d, 0),
            "delta": w_doors_book.get(d, 0) - b_doors_book.get(d, 0),
        }
        for d in all_door_keys_book
    }

    b_doors_rn = _count_doors(b_rn, b_profiles, baseline_compat)
    w_doors_rn = _count_doors(w_rn, w_profiles, working_compat)
    all_door_keys_rn = sorted(set(b_doors_rn.keys()) | set(w_doors_rn.keys()))
    door_mix_rn = {
        d: {
            "baseline": b_doors_rn.get(d, 0),
            "working": w_doors_rn.get(d, 0),
            "delta": w_doors_rn.get(d, 0) - b_doors_rn.get(d, 0),
        }
        for d in all_door_keys_rn
    }

    # 5. Distribution of z_momentum among Door-2 nominees
    def _extract_door2_z_mom(tickers_list: List[str], profiles: Dict[str, Any], compat: Dict[str, Any]) -> List[float]:
        z_vals: List[float] = []
        for t in tickers_list:
            prof = profiles.get(t) or compat.get("tickers", {}).get(t, {})
            doors = prof.get("nominated_doors") or prof.get("fct_nominated_doors") or []
            if any("DOOR_2" in d for d in doors):
                zm = prof.get("z_momentum")
                if zm is None and "fct_z" in prof:
                    zm = (prof.get("fct_z") or {}).get("momentum")
                if zm is not None:
                    z_vals.append(float(zm))
        return z_vals

    b_d2_z = _extract_door2_z_mom(b_book, b_profiles, baseline_compat)
    w_d2_z = _extract_door2_z_mom(w_book, w_profiles, working_compat)
    b_d2_stats = compute_distribution_stats(b_d2_z)
    w_d2_stats = compute_distribution_stats(w_d2_z)

    d2_delta = {
        k: (
            (w_d2_stats[k] - b_d2_stats[k])
            if (w_d2_stats[k] is not None and b_d2_stats[k] is not None)
            else None
        )
        for k in b_d2_stats
    }
    # Round delta floats
    for k in ("min", "p10", "median"):
        if d2_delta[k] is not None:
            d2_delta[k] = round(d2_delta[k], 3)

    # 6. Effective weights
    b_ew = baseline_summary.get("effective_weights")
    w_ew = working_summary.get("effective_weights")
    if b_ew is None and w_ew is None:
        effective_weights_payload = None
        effective_weights_reason = "not_emitted_by_this_version"
    else:
        effective_weights_payload = {
            "baseline": b_ew if b_ew is not None else {"value": None, "reason": "not_emitted_by_this_version"},
            "working": w_ew if w_ew is not None else {"value": None, "reason": "not_emitted_by_this_version"},
        }
        effective_weights_reason = None

    # 7. Veto counts by reason
    b_vetoes: Dict[str, int] = baseline_summary.get("veto_breakdown") or {}
    w_vetoes: Dict[str, int] = working_summary.get("veto_breakdown") or {}
    all_veto_keys = sorted(set(b_vetoes.keys()) | set(w_vetoes.keys()))
    veto_by_reason = {
        v: {
            "baseline": b_vetoes.get(v, 0),
            "working": w_vetoes.get(v, 0),
            "delta": w_vetoes.get(v, 0) - b_vetoes.get(v, 0),
        }
        for v in all_veto_keys
    }
    b_total_vetoed = baseline_summary.get("vetoed_count", sum(b_vetoes.values()))
    w_total_vetoed = working_summary.get("vetoed_count", sum(w_vetoes.values()))

    report = {
        "metadata": {
            "baseline_label": baseline_label,
            "working_label": working_label,
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "book": {
            "size": {
                "baseline": len(b_book),
                "working": len(w_book),
                "delta": len(w_book) - len(b_book),
            },
            "entered": book_entered,
            "left": book_left,
            "common_names_count": len(valid_common_book),
            "spearman_rank_correlation": spearman_book,
        },
        "research_now": {
            "size": {
                "baseline": len(b_rn),
                "working": len(w_rn),
                "delta": len(w_rn) - len(b_rn),
            },
            "entered": rn_entered,
            "left": rn_left,
            "common_names_count": len(valid_common_rn),
            "spearman_rank_correlation": spearman_rn,
        },
        "door_mix": {
            "book": door_mix_book,
            "top50": door_mix_rn,
        },
        "sector_mix": {
            "book": sector_mix_book,
            "top50": sector_mix_rn,
        },
        "cluster_mix": {
            "book": cluster_mix_book,
            "top50": cluster_mix_rn,
        },
        "door2_z_momentum": {
            "baseline": b_d2_stats,
            "working": w_d2_stats,
            "delta": d2_delta,
        },
        "effective_weights": effective_weights_payload,
        "effective_weights_reason": effective_weights_reason,
        "veto_breakdown": {
            "total_vetoed": {
                "baseline": b_total_vetoed,
                "working": w_total_vetoed,
                "delta": w_total_vetoed - b_total_vetoed,
            },
            "by_reason": veto_by_reason,
        },
    }

    # Saturation analysis (right-tail exp_gap saturation & |z|=3.0 count per pillar)
    def _saturation_stats(profiles: Dict[str, Any], compat: Dict[str, Any], nominated_list: List[str]) -> Dict[str, Any]:
        exp_gaps: List[float] = []
        for t in nominated_list:
            prof = profiles.get(t) or compat.get("tickers", {}).get(t, {})
            zg = prof.get("z_exp_gap")
            if zg is None and "fct_z" in prof:
                zg = (prof.get("fct_z") or {}).get("exp_gap")
            if zg is not None:
                exp_gaps.append(round(float(zg), 3))
        from collections import Counter
        counts = Counter(exp_gaps)
        shared = {str(k): v for k, v in sorted(counts.items()) if v > 1}
        nominees_sharing_exp_gap = sum(shared.values())

        pillars = ("quality", "momentum", "revisions", "value", "exp_gap")
        at_3_counts = {}
        for p in pillars:
            cnt = 0
            for t in nominated_list:
                prof = profiles.get(t) or compat.get("tickers", {}).get(t, {})
                val = prof.get(f"z_{p}")
                if val is None and "fct_z" in prof:
                    val = (prof.get("fct_z") or {}).get(p)
                if val is not None and abs(round(float(val), 3)) >= 3.0:
                    cnt += 1
            at_3_counts[p] = cnt

        return {
            "nominees_sharing_exp_gap_count": nominees_sharing_exp_gap,
            "shared_exp_gap_values": shared,
            "nominees_at_z_3_0": at_3_counts,
        }

    report["saturation"] = {
        "baseline": _saturation_stats(b_profiles, baseline_compat, b_book),
        "working": _saturation_stats(w_profiles, working_compat, w_book),
    }

    return report


def format_diff_summary(report: Dict[str, Any]) -> str:
    """Format diff metrics into a clean, human-readable text summary."""
    meta = report["metadata"]
    book = report["book"]
    rn = report["research_now"]
    door = report["door_mix"]
    d2 = report["door2_z_momentum"]
    veto = report["veto_breakdown"]

    lines: List[str] = []
    lines.append("=" * 80)
    lines.append("DUAL-DOOR SIFTER DIFF REPORT")
    lines.append(f"Baseline: {meta['baseline_label']}")
    lines.append(f"Working : {meta['working_label']}")
    lines.append(f"Date    : {meta['generated_at']}")
    lines.append("=" * 80)

    # 1. Book & Research_Now
    lines.append("\n[1. BOOK & RESEARCH_NOW OVERVIEW]")
    lines.append(
        f"  Book size (Nominated)  : Baseline {book['size']['baseline']:>3} | "
        f"Working {book['size']['working']:>3} | Delta {book['size']['delta']:>+3}"
    )
    lines.append(
        f"  Research_Now (Top 50)  : Baseline {rn['size']['baseline']:>3} | "
        f"Working {rn['size']['working']:>3} | Delta {rn['size']['delta']:>+3}"
    )

    lines.append(f"\n  Book In/Out ({len(book['entered'])} in, {len(book['left'])} out):")
    lines.append(f"    Entered book : {book['entered'] if book['entered'] else '[]'}")
    lines.append(f"    Left book    : {book['left'] if book['left'] else '[]'}")

    lines.append(f"\n  Research_Now In/Out ({len(rn['entered'])} in, {len(rn['left'])} out):")
    lines.append(f"    Entered RN   : {rn['entered'] if rn['entered'] else '[]'}")
    lines.append(f"    Left RN      : {rn['left'] if rn['left'] else '[]'}")

    # 2. Rank Churn
    lines.append("\n[2. RANK CHURN (Spearman Rank Correlation)]")
    sp_book_str = f"{book['spearman_rank_correlation']:.4f}" if book['spearman_rank_correlation'] is not None else "N/A"
    sp_rn_str = f"{rn['spearman_rank_correlation']:.4f}" if rn['spearman_rank_correlation'] is not None else "N/A"
    lines.append(f"  Book common names       : {book['common_names_count']} names | Spearman: {sp_book_str}")
    lines.append(f"  Research_Now common names: {rn['common_names_count']} names | Spearman: {sp_rn_str}")

    # 3. Door Mix
    lines.append("\n[3. DOOR MIX]")
    lines.append("  Top-50 (Research_Now) Door Mix:")
    for k, v in door["top50"].items():
        lines.append(f"    {k:<22}: Baseline {v['baseline']:>2} | Working {v['working']:>2} | Delta {v['delta']:>+2}")
    lines.append("  Full Book (Nominated) Door Mix:")
    for k, v in door["book"].items():
        lines.append(f"    {k:<22}: Baseline {v['baseline']:>2} | Working {v['working']:>2} | Delta {v['delta']:>+2}")

    # 4. Sector Mix
    lines.append("\n[4. SECTOR MIX]")
    lines.append("  Top-50 Sector Mix:")
    for s, v in report["sector_mix"]["top50"].items():
        if v["baseline"] > 0 or v["working"] > 0:
            lines.append(f"    {s:<24}: Baseline {v['baseline']:>2} | Working {v['working']:>2} | Delta {v['delta']:>+2}")
    lines.append("  Book Sector Mix:")
    for s, v in report["sector_mix"]["book"].items():
        if v["baseline"] > 0 or v["working"] > 0:
            lines.append(f"    {s:<24}: Baseline {v['baseline']:>2} | Working {v['working']:>2} | Delta {v['delta']:>+2}")

    # 5. Cluster Mix
    lines.append("\n[5. CLUSTER MIX (Active Clusters)]")
    lines.append("  Top-50 Active Clusters:")
    for c, v in report["cluster_mix"]["top50"].items():
        if v["baseline"] > 0 or v["working"] > 0:
            lines.append(f"    {c:<28}: Baseline {v['baseline']:>2} | Working {v['working']:>2} | Delta {v['delta']:>+2}")
    lines.append("  Book Active Clusters:")
    for c, v in report["cluster_mix"]["book"].items():
        if v["baseline"] > 0 or v["working"] > 0:
            lines.append(f"    {c:<28}: Baseline {v['baseline']:>2} | Working {v['working']:>2} | Delta {v['delta']:>+2}")

    # 6. Door-2 z_momentum distribution
    lines.append("\n[6. DOOR-2 Z_MOMENTUM DISTRIBUTION]")
    b_d2, w_d2, d_d2 = d2["baseline"], d2["working"], d2["delta"]
    lines.append(
        f"  Count (Door-2 nominees): Baseline {b_d2['count']:>3} | Working {w_d2['count']:>3} | Delta {d_d2['count']:>+3}"
    )
    min_b = f"{b_d2['min']:.3f}" if b_d2['min'] is not None else "N/A"
    min_w = f"{w_d2['min']:.3f}" if w_d2['min'] is not None else "N/A"
    min_d = f"{d_d2['min']:+.3f}" if d_d2['min'] is not None else "N/A"
    lines.append(f"  Min                    : Baseline {min_b:>7} | Working {min_w:>7} | Delta {min_d:>7}")

    p10_b = f"{b_d2['p10']:.3f}" if b_d2['p10'] is not None else "N/A"
    p10_w = f"{w_d2['p10']:.3f}" if w_d2['p10'] is not None else "N/A"
    p10_d = f"{d_d2['p10']:+.3f}" if d_d2['p10'] is not None else "N/A"
    lines.append(f"  P10                    : Baseline {p10_b:>7} | Working {p10_w:>7} | Delta {p10_d:>7}")

    med_b = f"{b_d2['median']:.3f}" if b_d2['median'] is not None else "N/A"
    med_w = f"{w_d2['median']:.3f}" if w_d2['median'] is not None else "N/A"
    med_d = f"{d_d2['median']:+.3f}" if d_d2['median'] is not None else "N/A"
    lines.append(f"  Median                 : Baseline {med_b:>7} | Working {med_w:>7} | Delta {med_d:>7}")

    lines.append(
        f"  Count < -1.0           : Baseline {b_d2['count_under_minus_1_0']:>3} | "
        f"Working {w_d2['count_under_minus_1_0']:>3} | Delta {d_d2['count_under_minus_1_0']:>+3}"
    )
    lines.append(
        f"  Count < -1.5           : Baseline {b_d2['count_under_minus_1_5']:>3} | "
        f"Working {w_d2['count_under_minus_1_5']:>3} | Delta {d_d2['count_under_minus_1_5']:>+3}"
    )
    lines.append(
        f"  Count < -2.0           : Baseline {b_d2['count_under_minus_2_0']:>3} | "
        f"Working {w_d2['count_under_minus_2_0']:>3} | Delta {d_d2['count_under_minus_2_0']:>+3}"
    )

    # 7. Effective weights
    lines.append("\n[7. EFFECTIVE WEIGHTS]")
    if report["effective_weights"] is None:
        lines.append(f"  Effective weights: null ({report['effective_weights_reason']})")
    else:
        lines.append(f"  {json.dumps(report['effective_weights'], indent=2)}")

    # 8. Veto breakdown
    lines.append("\n[8. VETO BREAKDOWN]")
    lines.append(
        f"  Total Vetoed           : Baseline {veto['total_vetoed']['baseline']:>4} | "
        f"Working {veto['total_vetoed']['working']:>4} | Delta {veto['total_vetoed']['delta']:>+4}"
    )
    for v, counts in veto["by_reason"].items():
        lines.append(
            f"    {v:<32}: Baseline {counts['baseline']:>4} | "
            f"Working {counts['working']:>4} | Delta {counts['delta']:>+4}"
        )

    # 9. Saturation Analysis
    if "saturation" in report:
        lines.append("\n[9. SATURATION ANALYSIS (RIGHT-TAIL & |z|=3.0)]")
        b_s = report["saturation"]["baseline"]
        w_s = report["saturation"]["working"]
        lines.append(
            f"  Nominees sharing z_exp_gap (to 3dp): Baseline {b_s['nominees_sharing_exp_gap_count']:>3} | "
            f"Working {w_s['nominees_sharing_exp_gap_count']:>3}"
        )
        if b_s['shared_exp_gap_values']:
            lines.append(f"    Baseline shared values: {b_s['shared_exp_gap_values']}")
        if w_s['shared_exp_gap_values']:
            lines.append(f"    Working shared values : {w_s['shared_exp_gap_values']}")
        lines.append("  Nominees sitting at |z| = 3.0 per pillar:")
        for p in ("quality", "momentum", "revisions", "value", "exp_gap"):
            lines.append(f"    {p:<12}: Baseline {b_s['nominees_at_z_3_0'].get(p, 0):>3} | Working {w_s['nominees_at_z_3_0'].get(p, 0):>3}")

    lines.append("=" * 80)
    return "\n".join(lines)


def run_diff(
    repo_root: Optional[Path] = None,
    baseline_ref: Optional[str] = None,
    baseline_file: Optional[Path] = None,
    working_file: Optional[Path] = None,
    data_dir: Optional[Path] = None,
    out_path: Optional[Path] = None,
    quiet: bool = True,
    z_method: str = "winsor",
) -> Tuple[Dict[str, Any], str]:
    """Orchestrate running baseline vs working tree sifter and computing diff."""
    repo_root = repo_root or ROOT
    working_file = working_file or DEFAULT_SIFTER_PATH

    # Load baseline code
    if baseline_file is not None:
        baseline_file = Path(baseline_file).resolve()
        baseline_code = baseline_file.read_text(encoding="utf-8")
        baseline_label = str(baseline_file.name)
    else:
        ref = resolve_baseline_ref(repo_root, baseline_ref)
        baseline_code = get_git_file_content(repo_root, ref)
        ref_short = ref[:10] if len(ref) >= 40 else ref
        baseline_label = f"git:{ref_short}"

    working_file = Path(working_file).resolve()
    working_code = working_file.read_text(encoding="utf-8")
    working_label = str(working_file.name)

    # Compile isolated modules
    mod_baseline = load_sifter_module(baseline_code, "sifter_baseline", working_file)
    mod_working = load_sifter_module(working_code, "sifter_working", working_file)

    old_z_env = os.environ.get("Z_METHOD")
    try:
        os.environ["Z_METHOD"] = z_method
        mod_working.Z_METHOD = z_method
        with tempfile.TemporaryDirectory() as td:
            temp_dir = Path(td)
            base_out = temp_dir / "baseline"
            work_out = temp_dir / "working"

            b_summary, b_compat = run_sifter(mod_baseline, base_out, data_dir=data_dir, quiet=quiet)
            w_summary, w_compat = run_sifter(mod_working, work_out, data_dir=data_dir, quiet=quiet)

            diff_report = compute_diff(
                b_summary,
                b_compat,
                w_summary,
                w_compat,
                baseline_label=baseline_label,
                working_label=working_label,
            )
    finally:
        if old_z_env is not None:
            os.environ["Z_METHOD"] = old_z_env
        else:
            os.environ.pop("Z_METHOD", None)

    summary_text = format_diff_summary(diff_report)

    # Save JSON report
    if out_path is None:
        fd, tmp_file = tempfile.mkstemp(prefix="dual_door_diff_", suffix=".json")
        os.close(fd)
        out_path = Path(tmp_file)

    out_path = Path(out_path).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(diff_report, indent=2), encoding="utf-8")

    return diff_report, summary_text


def parse_args():
    parser = argparse.ArgumentParser(
        description="Dual-Door Sifter diff harness (baseline vs working tree on identical inputs)."
    )
    parser.add_argument(
        "--baseline-ref",
        type=str,
        default=None,
        help="Git ref for baseline sifter (default: merge-base with origin/main).",
    )
    parser.add_argument(
        "--baseline-file",
        type=Path,
        default=None,
        help="Local python file for baseline sifter (overrides --baseline-ref).",
    )
    parser.add_argument(
        "--working-file",
        type=Path,
        default=DEFAULT_SIFTER_PATH,
        help="Working tree sifter file (default: scripts/score_factors_dual_door.py).",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Input data directory containing stocks.json etc. (default: public/data).",
    )
    parser.add_argument(
        "--z-method",
        type=str,
        default=os.environ.get("Z_METHOD", "winsor"),
        choices=["winsor", "gaussian_rank"],
        help="Z-score standardization method for working tree sifter (default: winsor).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output path for JSON diff report (default: temporary file).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print verbose output from sifters during execution.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    report, text_summary = run_diff(
        baseline_ref=args.baseline_ref,
        baseline_file=args.baseline_file,
        working_file=args.working_file,
        data_dir=args.data_dir,
        out_path=args.out,
        quiet=not args.verbose,
        z_method=args.z_method,
    )
    print(text_summary)
    if args.out:
        print(f"\nJSON diff report saved to: {args.out}")


if __name__ == "__main__":
    main()
