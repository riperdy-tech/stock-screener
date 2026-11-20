"""build_stock_driver_flags.py — each stock's own measured sensitivity to the three MRI drivers (WO_MW1).

Reads public/data/mri/driver_exposures.json (blocks `history` and `drivers`, written by the MRI and copied by mri_sync)
and public/data/daily_closes.json. Writes public/data/mri/stock_driver_flags.json. Nothing else is read.

For each ticker: ordinary least squares of its daily relative return (its log return minus the market's, percent) on a
constant and the daily changes of the three drivers (market: SPY log return in percent; rates: DGS10 change in basis
points; oil: log change in percent) over the last 260 calendar rows, rows where all four numbers exist; fewer than 150
such rows gives null exposures and a reason. A flag is an ANNOTATION: a driver with |t| >= 2.5 that has moved (the
exposures file's own `moved`, 21 sessions first, else 63). Never a gate, a score or a size.
"""

import argparse
import json
import math
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"

DRIVERS = ("market", "rates", "oil")
FIT_ROWS = 260        # the last calendar rows used in a fit
MIN_ROWS = 150        # fewer usable rows than this: no exposures
T_FLAG = 2.5          # |t| at or above this, and the driver moved: a flag
WINDOWS = ("21", "63")
STALE_DAYS = 7        # an exposures file older than this is not read

EVIDENCE = (
    "Measured 2026-11-20 on 537 names and 440 trading days (a short sample): fitted on up to 260 days, checked on the "
    "following 21 and 63 sessions. Across all names the hold is weak (rank correlation +0.15). Among names with |t| of "
    "2.5 or more (rates 8% of names, oil 12%), the sign of the next move against the index was right 60% to 67% of "
    "the time. The exposures do not forecast: they say what a stock gains or loses WHEN a driver moves. Annotation "
    "only; never a gate, a score or a size."
)


def _num(v):
    """A finite float, or None (a missing value is never a zero)."""
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


def _log_pct(a, b):
    """100 * ln(b / a) when both are positive numbers, else None."""
    a, b = _num(a), _num(b)
    return 100.0 * math.log(b / a) if a is not None and b is not None and a > 0 and b > 0 else None


def driver_changes(history):
    """One [market %, rates bp, oil %] row per calendar date; the first date, and any date lacking a number, gives None entries."""
    spy, dgs, oil = history["spy_close"], history["dgs10"], history["oil"]
    rows = [[None, None, None]]
    for i in range(1, len(history["dates"])):
        rate = None
        if _num(dgs[i]) is not None and _num(dgs[i - 1]) is not None:
            rate = (dgs[i] - dgs[i - 1]) * 100.0
        rows.append([_log_pct(spy[i - 1], spy[i]), rate, _log_pct(oil[i - 1], oil[i])])
    return rows


def fit_stock(closes, dates, changes):
    """OLS of the relative return on a constant and the three driver changes. Returns a dict for the ticker."""
    start = max(1, len(dates) - FIT_ROWS)
    y, x, days = [], [], []
    for i in range(start, len(dates)):
        c0, c1 = closes.get(dates[i - 1]), closes.get(dates[i])
        r = _log_pct(c0[0] if c0 else None, c1[0] if c1 else None)
        ch = changes[i]
        if r is None or any(v is None for v in ch):
            continue
        y.append(r - ch[0])
        x.append([1.0, *ch])
        days.append(dates[i])
    out = {"n_days": len(y), "first_day": days[0] if days else None, "last_day": days[-1] if days else None,
           "r2": None, "exposures": None}
    if len(y) < MIN_ROWS:
        out["reason"] = f"only {len(y)} usable days, fewer than {MIN_ROWS}"
        return out
    X, Y = np.array(x), np.array(y)
    if np.linalg.matrix_rank(X) < X.shape[1]:
        out["reason"] = "the driver changes are collinear over the window"
        return out
    beta = np.linalg.lstsq(X, Y, rcond=None)[0]
    resid = Y - X @ beta
    rss, tss = float(resid @ resid), float(((Y - Y.mean()) ** 2).sum())
    se = np.sqrt(np.diag(np.linalg.inv(X.T @ X)) * rss / (len(y) - X.shape[1]))
    exposures = {}
    for k, name in enumerate(DRIVERS, start=1):
        t = float(beta[k] / se[k]) if se[k] > 0 and math.isfinite(se[k]) else None
        exposures[name] = {"beta": round(float(beta[k]), 5), "t": None if t is None else round(t, 2)}
    out["exposures"] = exposures
    out["r2"] = round(1.0 - rss / tss, 4) if tss > 0 else None
    return out


def _signed(x, nd=1):
    """A number with an explicit sign, using the minus sign."""
    s = f"{abs(x):.{nd}f}"
    return ("−" if x < 0 and float(s) != 0 else "+") + s


def flag_text(driver, beta, t, window, change, implied):
    """The plain sentence for a flag. beta is in points against the index per unit of the driver's change."""
    down = "fell" if change < 0 else "rose"
    tail = f"in {window} sessions: about {_signed(implied)} points."
    if driver == "rates":
        return (f"Sensitive to the 10-year yield: about {_signed(beta * 10)} points against the index per 10 basis "
                f"points (t {_signed(t)}). The yield {down} {abs(change):.0f} basis points {tail}")
    if driver == "oil":
        return (f"Sensitive to oil: about {_signed(beta * 10)} points against the index per 10% in the oil price "
                f"(t {_signed(t)}). Oil {down} {abs(change):.1f}% {tail}")
    more = "more" if beta > 0 else "less"
    return (f"Falls about {abs(beta):.1f} points {more} than the index for each 1% the index falls (t {_signed(t)}). "
            f"The index {down} {abs(change):.1f}% {tail}")


def flags_for(exposures, drivers):
    """The flags for one ticker, sorted by |implied| descending. A driver counts as moved at 21 sessions first, else 63."""
    flags = []
    for name in DRIVERS:
        e = exposures.get(name) or {}
        if e.get("t") is None or abs(e["t"]) < T_FLAG:
            continue
        wins = ((drivers or {}).get(name) or {}).get("windows") or {}
        window = next((w for w in WINDOWS if (wins.get(w) or {}).get("moved") is True
                       and _num((wins.get(w) or {}).get("change")) is not None), None)
        if window is None:
            continue
        change, z = wins[window]["change"], wins[window].get("z")
        implied = e["beta"] * change
        flags.append({"driver": name, "beta": e["beta"], "t": e["t"], "window": int(window),
                      "change": round(change, 3), "z": None if _num(z) is None else round(z, 2),
                      "implied": round(implied, 3),
                      "text": flag_text(name, e["beta"], e["t"], window, change, implied)})
    return sorted(flags, key=lambda f: -abs(f["implied"]))


def _load(path):
    try:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return doc if isinstance(doc, dict) else None


def build(exposures_path, closes_path, today=None, now=None):
    """The document. A missing, degraded or stale exposures file gives empty tickers and the reason, never an error."""
    now = now or datetime.now(timezone.utc)
    today = today or now.date()
    doc = {"as_of": None, "built_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "drivers": None, "tickers": {},
           "counts": {"fitted": 0, "flagged": 0, "per_driver": {d: 0 for d in DRIVERS}},
           "evidence": EVIDENCE, "reasons": []}
    exp = _load(exposures_path)
    if exp is None:
        doc["reasons"].append("exposures_missing: driver_exposures.json is missing or unreadable")
        return doc
    doc["as_of"], doc["drivers"] = exp.get("as_of"), exp.get("drivers")
    try:
        age = (today - date.fromisoformat(str(exp.get("as_of"))[:10])).days
    except ValueError:
        age = None
    hist = exp.get("history")
    if exp.get("degraded") is not False:
        doc["reasons"].append("exposures_degraded: the exposures file is marked degraded")
    elif age is None or age > STALE_DAYS:
        doc["reasons"].append(f"exposures_stale: as_of {exp.get('as_of')} is not within {STALE_DAYS} days")
    elif not isinstance(hist, dict) or not all(isinstance(hist.get(k), list) for k in ("dates", "spy_close", "dgs10", "oil")) \
            or len({len(hist[k]) for k in ("dates", "spy_close", "dgs10", "oil")}) != 1:
        doc["reasons"].append("exposures_no_history: the history block is missing or misaligned")
    closes = _load(closes_path)
    if closes is None or not isinstance(closes.get("tickers"), dict):
        doc["reasons"].append("closes_missing: daily_closes.json is missing or has no tickers")
    if doc["reasons"]:
        return doc

    dates, changes = hist["dates"], driver_changes(hist)
    for tk in sorted(closes["tickers"]):
        series = closes["tickers"][tk]
        if not isinstance(series, dict):
            continue
        entry = fit_stock(series, dates, changes)
        entry["flags"] = flags_for(entry["exposures"], doc["drivers"]) if entry["exposures"] else []
        doc["tickers"][tk] = entry
        if entry["exposures"]:
            doc["counts"]["fitted"] += 1
        if entry["flags"]:
            doc["counts"]["flagged"] += 1
        for f in entry["flags"]:
            doc["counts"]["per_driver"][f["driver"]] += 1
    return doc


def write(doc, path):
    """One ticker per line, sorted, so the daily diff is small. allow_nan=False: a NaN is an error, not a value."""
    dump = lambda v: json.dumps(v, allow_nan=False)  # noqa: E731
    lines = ["{"]
    for key in ("as_of", "built_at", "drivers", "counts", "evidence", "reasons"):
        lines.append(f'  "{key}": {dump(doc[key])},')
    tickers = [f"    {dump(t)}: {dump(doc['tickers'][t])}" for t in sorted(doc["tickers"])]
    lines.append('  "tickers": {' + ("\n" + ",\n".join(tickers) + "\n  " if tickers else "") + "}")
    lines.append("}")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Build each stock's measured driver sensitivities and flags.")
    parser.add_argument("--exposures", default=str(DATA / "mri" / "driver_exposures.json"))
    parser.add_argument("--closes", default=str(DATA / "daily_closes.json"))
    parser.add_argument("--out", default=str(DATA / "mri" / "stock_driver_flags.json"))
    args = parser.parse_args()
    doc = build(args.exposures, args.closes)
    write(doc, args.out)
    c = doc["counts"]
    print(f"build_stock_driver_flags: fitted {c['fitted']}, flagged {c['flagged']}, per driver {c['per_driver']}")
    for r in doc["reasons"]:
        print(f"  reason: {r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
