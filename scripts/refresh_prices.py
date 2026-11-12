"""refresh_prices.py — overlay LIVE yfinance prices onto stocks.json.

Why this exists: the bulk fetch's price source (defeatbeta) was a once-daily EOD
mirror — every price it served was yesterday's close, and when its single
maintainer skipped a publish the whole pipeline fell back to a multi-hour legacy
scan. That source has been dead since 2026-09-17 (HTTP 404), so the legacy scan is
now every run, not the fallback; this script's independence from it is the normal case. This script makes price freshness independent of that: batched
yf.download for the entire universe (~14 requests for ~7k names, minutes, far
below the per-ticker .info load that used to hit Yahoo's throttle).

Two call sites:
  * after fetch_data.py in the post-open fetch  -> bands score on intraday prices
  * alone in the post-close price-refresh run   -> bands, ledger marks and the
    RS2 review all see the actual closing prices

ATOMIC BY DESIGN: cross-sectional percentile ranks only distort when price
timestamps MIX, so this either overlays >= MIN_COVERAGE of the universe or
changes nothing at all. A partial overlay is worse than a stale-but-consistent
snapshot and never happens.

DATED, NOT "LAST BAR": each name's close is read with its bar date. The session this run
is for is the last COMPLETED New York session at run time, taken from a reference series
(IWM) fetched with the batch (the repository has no market calendar). The overlay is written
only when >= MIN_COVERAGE of the names that returned a price carry THAT session's bar;
otherwise nothing is written and the script exits non-zero. A name whose newest bar is older
keeps its stored price and gets `price_older_than_asof` (its bar date). The session is
stamped as `_meta.price_asof` on the first row of stocks.json; track_paper_portfolios.py keys
its ledger rows by it and run_chain.py copies it into chain_manifest.json. A run before the
session closes therefore overlays the PREVIOUS close, never an intraday price.

Updates per symbol: price, marketCap (scaled by price ratio — avoids share-count
drift), and the last monthlyCloses point (momentum's live tail; earlier points
are dividend-adjusted history and are left alone). When the session is in a later month
than the series' last element (metrics.monthlyCloseMonths), the series gains a new element
instead: the old last element becomes that month's last close.

Liquidity: the same download carries volume. Per name, metrics.adv_20d_usd is the median of
close x volume over its last ADV_SESSIONS completed sessions (adv_20d_sessions: how many it had,
adv_20d_asof: the bar date the window ends on). Fewer than ADV_MIN_SESSIONS sessions: no figure,
adv_20d_reason says why, and a figure stored earlier is left as it was. A zero volume is a value.

Usage:
    python scripts/refresh_prices.py           # overlay onto public/data/stocks.json
    python scripts/refresh_prices.py --dry-run # fetch + report coverage, write nothing
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
STOCKS_JSON = ROOT / "public" / "data" / "stocks.json"

CHUNK = 250          # tickers per yf.download call
MIN_COVERAGE = 0.90  # below this the overlay aborts and the file is untouched
REF_SYMBOL = "IWM"   # reference series: its last completed bar names the session
WINDOW_DAYS = 14     # bars requested before the session: covers the last close of the prior month
ADV_WINDOW_DAYS = 45  # calendar days of bars for the 20-session dollar volume (holidays included)
ADV_SESSIONS = 20
ADV_MIN_SESSIONS = 10
CLOSE_BUFFER = timedelta(minutes=30)  # a bar dated today is final this long after 16:00 New York

# Yahoo rate-limits BURSTS, not volume: threads=True fires one HTTP request per
# ticker as fast as possible and dies with YFRateLimitError within a few hundred
# names (observed: 498/500 failed). The legacy fetch path sustains ~145 req/min
# sequentially for 90+ minutes without complaint, so this fetcher is paced:
# sequential downloads, a pause between chunks, and exponential backoff when the
# limiter still objects. Whole universe ≈ 45-55 min — fine for both call sites.
CHUNK_PAUSE = 2.0    # seconds between chunks
BACKOFFS = (60, 180, 420)  # seconds to wait after a rate-limited chunk


def num(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) and v > 0 else None


def _is_rate_limit(exc: Exception) -> bool:
    s = f"{type(exc).__name__}: {exc}"
    return "RateLimit" in s or "Too Many Requests" in s or "429" in s


def last_completed_session(bar_dates: list[str], now: datetime | None = None) -> str | None:
    """Newest bar date that is a finished session at `now` (UTC): any date before today in
    New York, or today's once 16:00 New York plus CLOSE_BUFFER has passed (an early close
    only makes this later than needed). None when no bar qualifies."""
    from zoneinfo import ZoneInfo
    now_ny = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo("America/New_York"))
    today = now_ny.date().isoformat()
    closed_today = now_ny >= now_ny.replace(hour=16, minute=0, second=0, microsecond=0) + CLOSE_BUFFER
    done = [d for d in bar_dates if d < today or (d == today and closed_today)]
    return max(done) if done else None


def fetch_bars(symbols: list[str], start: str, end: str,
               volumes: dict | None = None) -> dict[str, list[tuple[str, float]]]:
    """Paced daily bars, start inclusive / end exclusive. Returns {symbol: [(date, close)]}
    oldest first, for every symbol with at least one bar. When `volumes` is given, the same
    download also fills it: {symbol: {date: volume}} for the dates that have a close."""
    import yfinance as yf
    out: dict[str, list[tuple[str, float]]] = {}

    def volumes_of(vcol, bars):
        have = {str(idx)[:10]: float(v) for idx, v in vcol.dropna().items()}
        return {d: have[d] for d, _ in bars if d in have and math.isfinite(have[d]) and have[d] >= 0}

    def bars_of(col):
        return [(str(idx)[:10], p) for idx, v in col.dropna().items() if (p := num(float(v)))]

    n_chunks = (len(symbols) - 1) // CHUNK + 1
    for i in range(0, len(symbols), CHUNK):
        chunk = symbols[i:i + CHUNK]
        got = 0
        for attempt in range(len(BACKOFFS) + 1):
            try:
                df = yf.download(" ".join(chunk), start=start, end=end, interval="1d",
                                 auto_adjust=False, progress=False, threads=False)
                closes = df["Close"] if "Close" in df else df
                vols = df["Volume"] if volumes is not None and "Volume" in df else None
                if hasattr(closes, "columns"):        # multi-ticker frame
                    for sym in closes.columns:
                        bars = bars_of(closes[sym])
                        if bars:
                            out[str(sym)] = bars
                            got += 1
                            if vols is not None and sym in vols:
                                volumes[str(sym)] = volumes_of(vols[sym], bars)
                elif len(chunk) == 1:                  # single-ticker series
                    bars = bars_of(closes)
                    if bars:
                        out[chunk[0]] = bars
                        got = 1
                        if vols is not None:
                            volumes[chunk[0]] = volumes_of(vols, bars)
                # a chunk that "succeeds" but prices almost nothing is a silent
                # rate-limit (yfinance eats per-ticker errors) — back off and retry
                if got < len(chunk) * 0.5 and attempt < len(BACKOFFS):
                    print(f"  chunk {i // CHUNK + 1}: only {got}/{len(chunk)} priced — "
                          f"treating as rate-limit, backing off {BACKOFFS[attempt]}s")
                    time.sleep(BACKOFFS[attempt])
                    continue
                break
            except Exception as e:
                if _is_rate_limit(e) and attempt < len(BACKOFFS):
                    print(f"  chunk {i // CHUNK + 1}: rate-limited, "
                          f"backing off {BACKOFFS[attempt]}s")
                    time.sleep(BACKOFFS[attempt])
                    continue
                print(f"  chunk {i // CHUNK + 1}: failed: {e}", file=sys.stderr)
                break
        print(f"  chunk {i // CHUNK + 1}/{n_chunks}: cumulative {len(out)} priced")
        time.sleep(CHUNK_PAUSE)
    return out


def adv_20d(bars: list[tuple[str, float]], vols: dict | None) -> tuple[float | None, int, str | None]:
    """Median of close x volume over the last ADV_SESSIONS bars that carry a volume. Returns
    (figure, sessions used, date of the last session). The figure is None below
    ADV_MIN_SESSIONS; a zero volume is a value, so the figure can be 0.0."""
    used = [(d, c * vols[d]) for d, c in bars if vols and d in vols][-ADV_SESSIONS:]
    if not used:
        return None, 0, None
    n, asof = len(used), used[-1][0]
    if n < ADV_MIN_SESSIONS:
        return None, n, asof
    return round(statistics.median(v for _, v in used), 2), n, asof


def month_end_close(prior_month: str, bars: list[tuple[str, float]], daily: dict | None) -> float | None:
    """Last close of `prior_month` (YYYY-MM) for a name rolling into a later month: from its
    daily series when that series reaches into a later month, else from this run's bars when
    they do. None when neither shows the month ended."""
    for series in (sorted((daily or {}).items()), bars):
        if any(d[:7] > prior_month for d, _ in series):
            in_month = [c for d, c in series if d[:7] == prior_month]
            if in_month:
                return in_month[-1]
    return None


def _month_index(month: str) -> int:
    return int(month[:4]) * 12 + int(month[5:7]) - 1


def roll_monthly(metrics: dict, session: str, p_new: float, bars: list[tuple[str, float]],
                 daily: dict | None) -> str:
    """Write the session price into the monthly series. Returns what happened:
    'overwrite' (same month: the live tail moves), 'roll' (new month: a new element),
    'stamp' (series had no month stamps: tail overwritten as before, stamped now),
    'gap' (series is more than one month behind: left alone for the next rebuild)."""
    closes = metrics["monthlyCloses"]
    month = session[:7]
    months = metrics.get("monthlyCloseMonths")
    if not (isinstance(months, list) and len(months) == len(closes)):
        closes[-1] = round(p_new, 4)
        top = _month_index(month)
        metrics["monthlyCloseMonths"] = [f"{(top - k) // 12}-{(top - k) % 12 + 1:02d}"
                                         for k in range(len(closes) - 1, -1, -1)]
        return "stamp"
    last = months[-1]
    if month <= last:
        closes[-1] = round(p_new, 4)
        return "overwrite"
    if _month_index(month) - _month_index(last) > 1:
        return "gap"
    end = month_end_close(last, bars, daily)
    unconfirmed = [m for m in (metrics.get("monthlyCloseUnconfirmed") or []) if m != last]
    if end is not None:
        closes[-1] = round(end, 4)
    else:
        unconfirmed.append(last)   # the old live tail stays: its month is not a confirmed month-end
    closes.append(round(p_new, 4))
    months.append(month)
    if unconfirmed:
        metrics["monthlyCloseUnconfirmed"] = unconfirmed
    else:
        metrics.pop("monthlyCloseUnconfirmed", None)
    return "roll"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true", help="report coverage, write nothing")
    ap.add_argument("--stocks-json", default=None, help="override path (testing)")
    args = ap.parse_args()

    path = Path(args.stocks_json) if args.stocks_json else STOCKS_JSON
    rows = json.loads(path.read_text(encoding="utf-8"))
    symbols = [r["symbol"] for r in rows if isinstance(r, dict) and r.get("symbol")]
    print(f"universe: {len(symbols)} symbols from {path.name}")

    now = _now()
    today = now.date()
    ref = fetch_bars([REF_SYMBOL], (today - timedelta(days=WINDOW_DAYS)).isoformat(),
                     (today + timedelta(days=1)).isoformat()).get(REF_SYMBOL, [])
    session = last_completed_session([d for d, _ in ref], now)
    if not session:
        print(f"ABORT: no completed session found in the {REF_SYMBOL} reference bars — "
              f"stocks.json left untouched")
        sys.exit(3)
    d_session = date.fromisoformat(session)
    print(f"session this run prices: {session} (last completed New York session)")

    vols: dict[str, dict] = {}
    bars = fetch_bars(symbols, (d_session - timedelta(days=ADV_WINDOW_DAYS)).isoformat(),
                      (d_session + timedelta(days=1)).isoformat(), volumes=vols)
    live = {s: b[-1][1] for s, b in bars.items()}
    coverage = len(live) / len(symbols) if symbols else 0
    print(f"live prices: {len(live)} / {len(symbols)} ({coverage:.1%})")

    if coverage < MIN_COVERAGE:
        # A partial overlay would mix price timestamps across the cross-section
        # and tilt every percentile rank. Keep the consistent snapshot instead.
        print(f"ABORT: coverage {coverage:.1%} < {MIN_COVERAGE:.0%} — "
              f"stocks.json left untouched (consistent snapshot preserved)")
        sys.exit(3)

    # All or nothing on the DATE: never a mix of two sessions in one file.
    on_dates: dict[str, int] = {}
    for s in live:
        d = bars[s][-1][0]
        on_dates[d] = on_dates.get(d, 0) + 1
    on_session = on_dates.get(session, 0)
    share = on_session / len(live)
    by_date = ", ".join(f"{d}: {n}" for d, n in sorted(on_dates.items(), reverse=True))
    print(f"bar dates of the {len(live)} priced names ({session} expected): {by_date}")
    if share < MIN_COVERAGE:
        print(f"ABORT: only {on_session}/{len(live)} names ({share:.1%}) carry the {session} bar, "
              f"< {MIN_COVERAGE:.0%} — stocks.json left untouched (never a mix of two dates)")
        sys.exit(4)

    if args.dry_run:
        sample = [(s, live[s]) for s in list(live)[:5]]
        print(f"dry run — no write. sample: {sample}")
        return

    daily = None
    daily_path = path.parent / "daily_closes.json"
    if daily_path.exists():
        try:
            daily = (json.loads(daily_path.read_text(encoding="utf-8")).get("tickers") or {})
        except Exception as e:
            print(f"  daily_closes.json unreadable ({e}) — month-ends come from this run's bars only",
                  file=sys.stderr)

    updated = big_moves = older = 0
    adv_set = adv_short = 0
    month_acts: dict[str, int] = {}
    for r in rows:
        sym = r.get("symbol") if isinstance(r, dict) else None
        p_new = live.get(sym)
        if not p_new:
            continue
        if sym in vols:
            figure, n_sess, adv_asof = adv_20d(bars[sym], vols[sym])
            if n_sess:
                if not isinstance(r.get("metrics"), dict):
                    r["metrics"] = {}
                m = r["metrics"]
                m["adv_20d_sessions"], m["adv_20d_asof"] = n_sess, adv_asof
                if figure is not None:
                    m["adv_20d_usd"] = figure
                    m.pop("adv_20d_reason", None)
                    adv_set += 1
                else:
                    m["adv_20d_reason"] = "fewer_than_10_sessions"
                    adv_short += 1
        if bars[sym][-1][0] != session:
            # Its newest bar is older than the file's session: keep the stored price and say so.
            r["price_older_than_asof"] = bars[sym][-1][0]
            older += 1
            continue
        r.pop("price_older_than_asof", None)
        p_old = num(r.get("price"))
        r["price"] = round(p_new, 4)
        if p_old:
            ratio = p_new / p_old
            if abs(ratio - 1) > 0.25:
                big_moves += 1   # logged; big single-day moves are rare but real
            mc = num(r.get("marketCap"))
            if mc:
                r["marketCap"] = round(mc * ratio)
        metrics = r.get("metrics") or {}
        closes = metrics.get("monthlyCloses")
        if isinstance(closes, list) and closes:
            act = roll_monthly(metrics, session, p_new, bars[sym],
                               (daily or {}).get(sym) if isinstance(daily, dict) else None)
            month_acts[act] = month_acts.get(act, 0) + 1
        updated += 1

    meta = {"price_refresh_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "price_refresh_coverage": round(coverage, 4),
            "price_asof": session,
            "price_asof_names": on_session,
            "price_older_names": older}
    # stocks.json is a bare list; stash the marker on the first row's namespace-safe key
    if rows and isinstance(rows[0], dict):
        rows[0].setdefault("_meta", {}).update(meta)

    path.write_text(json.dumps(rows, ensure_ascii=False) + "\n", encoding="utf-8")
    # The site's price file: stocks.json is about 28 MB, too large for a browser to load for one column.
    # Same prices, same session stamp, written in the same run; the site reads this for prices.
    # Per symbol: [price, the bar date when it is older than the session, else null].
    small = {"asof": session, "refreshed_at": meta["price_refresh_at"],
             "prices": {r["symbol"]: [r["price"], r.get("price_older_than_asof")]
                        for r in rows if isinstance(r, dict) and r.get("symbol") and num(r.get("price"))}}
    (path.parent / "prices.json").write_text(json.dumps(small, separators=(",", ":")) + chr(10), encoding="utf-8")
    print(f"wrote {path.name}: {updated} prices overlaid at {session}, {older} older-bar names kept "
          f"their stored price, {big_moves} moved >25% (check if unusually many); "
          f"monthly series: {month_acts or 'none touched'}; 20-day dollar volume: "
          f"{adv_set} figures, {adv_short} names under {ADV_MIN_SESSIONS} sessions")


if __name__ == "__main__":
    main()
