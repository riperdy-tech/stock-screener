"""track_paper_portfolios.py — live paper-trading ledgers (Track Record tab).

The honest, forward meter the ecosystem review (§H) prescribes: from
inception onward, simulate ACTUALLY FOLLOWING the system day by day and
record what happens. Live books:

  equal    — equal-weight basket of every research_now name (factor_scores).
             Pure selection test, no sizing effects.
  rn_depth — equal-weight basket of research_now/watchlist names carrying an
             "undervalued" RS2 depth verdict (depth_overlay.json). The AI book.
  mine     — the user's actual holdings (public/data/my_portfolio.json, written
             by the My Portfolio UI). Unitized like a fund: edits are treated
             as deposits/withdrawals that buy/sell units, so adding money never
             fakes performance. "Did I beat my own system?"

  RETIRED (frozen in paper_ledgers.json, no longer computed): plan / plan2 (the
  portfolio_plan.json Kelly books, retired 2026-08-27), plan3 (momentum sleeve,
  retired 2026-08-27), and the *_llm overlay lane (plan_llm / plan2_llm /
  equal_llm, retired 2026-08-26 in the depth migration).

Mechanics: trade-on-change only (buy on entry to the target set, sell on
exit; held positions drift). 10 bps transaction cost per side. Marks come
from stocks.json prices (fresh from the daily fetch); missing marks carry
the last price and are flagged stale. Benchmark IWM via one yfinance call.

Idempotent per date: re-running the same day rewinds to the day's opening
state and replays it, so CI re-runs can't double-trade.

Usage:
    python scripts/track_paper_portfolios.py                 # as of today
    python scripts/track_paper_portfolios.py --as-of 2026-06-15   # testing
State: public/data/paper_ledgers.json (append-only history inside).
"""

import argparse
import collections
import copy
import json
import math
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
STOCKS_JSON = DATA / "stocks.json"
FACTOR_SCORES_JSON = DATA / "factor_scores.json"
PORTFOLIO_PLAN_JSON = DATA / "portfolio_plan.json"
DEPTH_OVERLAY_JSON = DATA / "depth_overlay.json"             # RS2 depth verdicts — rn_depth ledger targets
# The old llm_overlay.json / portfolio_plan_llm.json lane (plan_llm/plan2_llm/equal_llm)
# was RETIRED in the depth migration (2026-08-26); rn_depth is the depth paper book.
PORTFOLIO_PLAN_MOMO_JSON = DATA / "portfolio_plan_momo.json"  # plan3 momentum sleeve
MY_PORTFOLIO_JSON = DATA / "my_portfolio.json"
LEDGERS_JSON = DATA / "paper_ledgers.json"
DIVIDENDS_JSON = DATA / "dividends.json"

# Ex-dividend calendar for the run, {ticker: [[ex_date, per_share_amount], ...]}.
# Stashed module-side so the credit step can reach it without threading the arg
# through run_target_ledger / run_mine_ledger.
dividends_holder = {}

# Per-ticker price freshness for the run: {"asof": {ticker: "YYYY-MM-DD"},
# "snapshot_date": "YYYY-MM-DD"} read off stocks.json Last_Updated. Stashed
# module-side for the same reason as dividends_holder — mark_price is called from
# a dozen places and threading the map through all of them buys nothing. Empty
# means "no freshness metadata", which price_is_stale reads as fresh.
price_asof_holder = {}

COST_BPS = 25  # real KIS overseas commission per side (user 2026-07-20); was 10 (idealized)
BENCHMARKS = ["IWM", "SPY", "QQQ", "SOXX", "DRAM"]  # small-cap, S&P500, Nasdaq-100, semis, memory
PRIMARY_BENCHMARK = "IWM"
START_NAV = 100.0
POST_EXIT_DAYS = 30

# ── plan3 · bold (momentum sleeve) risk machinery ────────────────────────────
# Offense lives in build_momo_plan.py (weekly momentum rank + daily regime
# throttle). Defense lives HERE because only the tracker marks daily:
#   trailing stop — per-position, off the high-water mark since entry;
#   cooldown     — a stopped-out name may not re-enter for N calendar days,
#                  so a crash can't re-buy itself the next run (the JLHL loop);
#   kill switch  — tiers on the LEDGER's own drawdown from peak NAV. Gross is
#                  cut at -15%/-20%, and at -25% the book liquidates and HALTS
#                  (state.halted) until manually reset. (User 2026-07-13: "let
#                  it run hotter" — original tiers were -10/-15/-20.)
# Tier recovery uses ~2pt hysteresis so a NAV oscillating on a boundary does
# not churn gross up and down every day. All of this state lives inside
# ledger["state"] so the same-day rewind restores it (idempotent reruns).
PLAN3_TRAIL_STOP = 0.15        # exit at 15% off the position's high-water mark
PLAN3_COOLDOWN_DAYS = 14       # calendar days (~10 trading days) re-entry ban
PLAN3_REBAL_BAND = 0.25        # rebalance only outside +/-25% of target value
PLAN3_MIN_TRADE = 0.05         # NAV pts; skip dust trades the band lets through
PLAN3_DD_HALF = -0.15          # ledger DD tiers: half gross
PLAN3_DD_QUARTER = -0.20       # quarter gross
PLAN3_DD_KILL = -0.25          # liquidate + halt
PLAN3_TIER_HYSTERESIS = 0.02   # recover a tier only this far above its trigger

# ── source-health gates ──────────────────────────────────────────────────────
# A name absent from a target set means one of two things, and they demand
# opposite responses: it was EVALUATED and demoted (sell), or it was NOT
# EVALUATED (hold — we know nothing). The old collapse breaker could not tell
# them apart, so it inferred "upstream failure" from the *portfolio's* reaction
# (>25% of holdings exiting at once) — a proxy that is perfectly correlated with
# a genuine market crash, i.e. it fired hardest exactly when it should not.
# These gates check the INPUT instead, and unknown-vs-demoted is decided per
# name, so no time-delay counter is needed.
FACTOR_MAX_AGE_H = 36        # factor_scores.json content age (generated_at)
SCORED_COUNT_MIN_RATIO = 0.9  # vs the last healthy run
ALERT_RETENTION_DAYS = 7      # how long a held/underfunded alert stays on the site banner
# Fund an entrant only when the cash covers at least this much of its target weight.
# Nothing ever tops a position back up (this function only trims overweights), so a
# badly-underfunded entrant would stay underweight indefinitely — defer it instead and
# let it re-enter at full size once an exit frees cash. The 10% slack absorbs the
# transaction cost of the trims that raised the cash (trimming $100 to a $50 target
# returns $49.95 at 10bps) and tolerates a mild underweight in preference to holding
# no position at all.
ENTRY_FUND_TOL = 0.90

# Bands that mean "this name was not evaluated today", as opposed to "evaluated
# and did not make the cut". `insufficient_factors` is emitted by score_factors
# when a name cannot be scored; a missing entry means the same thing.
UNEVALUATED_BANDS = (None, "insufficient_factors")


def evaluated_quant(entry):
    """True if the quant engine actually banded this name today."""
    return bool(entry) and entry.get("fct_band") not in UNEVALUATED_BANDS


def evaluated_llm(entry):
    """True if the LLM overlay actually graded this name today.

    A missing fct_band_llm means the overlay did not speak. It must NEVER fall
    back to fct_band: that reads silence as a verdict and manufactures phantom
    departures (2026-06-30: 19 of them; 2026-07-05: 57).
    """
    return bool(entry) and entry.get("fct_band_llm") is not None
MIN_EQUAL_NAMES = 8      # #8 concentration floor: equal-weight over max(count, this) -> cash residual when few

# ── rn_depth ledger (added 2026-08-26) ───────────────────────────────────────
# Mirrors the site's RESEARCH NOW panel, which no other ledger reads: the quant
# `equal` sleeve gates on the quant band (fct_band) and never looks at a depth
# verdict, so the RS2 depth run drove the UI and, now, this ledger.
#
# The gate MUST stay identical to lib/desk/rankings.ts:139-143 (aiSections) or the
# ledger silently trades a different book than the panel shows: a row is in when it
# is not vetoed, carries a depth verdict, and that verdict reads "undervalued".
# No fct_band filter — a watchlist-band name with an undervalued depth verdict is
# on the panel and belongs here too.
#
# EQUAL weight, one slot per name (operator decision 2026-08-26). The depth
# engine's size_hint (full/half/quarter) is deliberately NOT used for sizing —
# it stays display-only, as it is everywhere else in the repo.
#
# Same MIN_EQUAL_NAMES concentration floor as the quant equal sleeve: a panel that
# shrinks to a handful of names leaves the remainder in cash instead of
# concentrating the whole book into them.


def depth_targets(factor: dict, depth: dict) -> dict:
    """{ticker: weight_pct} for the RESEARCH NOW panel, equally weighted.

    factor: factor_scores["tickers"], depth: depth_overlay["tickers"].
    Mirrors aiSections() — see the note above.
    """
    names = []
    for ticker, entry in factor.items():
        if not isinstance(entry, dict) or entry.get("fct_rank") is None:
            continue
        verdict = depth.get(ticker)
        if not verdict:
            continue
        # A vetoed name is disqualified before the depth run is consulted.
        if entry.get("fct_veto") or entry.get("fct_llm_veto"):
            continue
        if verdict.get("direction") != "undervalued":
            continue
        if verdict.get("actionable") is False:
            continue
        names.append(ticker)
    if not names:
        return {}
    weight = 100.0 / max(len(names), MIN_EQUAL_NAMES)
    return {t: weight for t in names}


# F-04 hysteresis (equal_llm) was REMOVED in the depth migration (2026-08-26). It
# existed only because apply_llm_overlay recomputed live MoS against daily-moving
# prices, so a held name near the research_now cliff round-tripped on price noise. The
# depth gate reads the FROZEN `direction` verdict (rn_depth / aiSections) — constant
# until the producer re-runs — so there is no daily cliff to churn across, and nothing
# for a hysteresis to protect. See depth-migration-decisions in memory / handoff §6.4.


def load_json(path, default=None):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def supabase_env():
    return os.environ.get("NEXT_PUBLIC_SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")


def sb_get(path):
    """GET PostgREST rows (service key). Returns parsed list or None."""
    url, key = supabase_env()
    if not (url and key):
        return None
    try:
        import requests
        r = requests.get(f"{url}/rest/v1/{path}",
                         headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=30)
        if r.status_code == 200:
            return r.json()
        print(f"  supabase GET {path} -> {r.status_code}: {r.text[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"  supabase GET {path} failed: {e}", file=sys.stderr)
    return None


def sb_upsert(table, row, on_conflict):
    """Upsert one row via PostgREST (service key, merge-duplicates). Returns bool."""
    url, key = supabase_env()
    if not (url and key):
        return False
    try:
        import requests
        r = requests.post(f"{url}/rest/v1/{table}?on_conflict={on_conflict}",
                          headers={"apikey": key, "Authorization": f"Bearer {key}",
                                   "Content-Type": "application/json",
                                   "Prefer": "resolution=merge-duplicates,return=minimal"},
                          data=json.dumps(row), timeout=30)
        if r.status_code in (200, 201, 204):
            return True
        print(f"  supabase upsert {table} -> {r.status_code}: {r.text[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"  supabase upsert {table} failed: {e}", file=sys.stderr)
    return False


def save_ledgers_to_supabase(book):
    """Mirror the GLOBAL ledger book (plan/plan2/equal) to Supabase (paper_ledgers
    row id=1). The site reads it at runtime via /api/paper-ledgers — no commit /
    redeploy. No-op without Supabase env (dev); the committed JSON stays a backup.
    Per-user `mine` ledgers live in user_mine_ledgers, not here.
    """
    if sb_upsert("paper_ledgers",
                 {"id": 1, "data": book, "updated_at": datetime.now(timezone.utc).isoformat()},
                 "id"):
        print("  global ledgers mirrored to Supabase.")


def num(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) and v > 0 else None


def empty_ledger():
    return {
        "current_date": None,
        "state": {"holdings": {}, "cash": START_NAV, "units": None},
        "prev_day_state": None,
        "last_marks": {},
        "nav_series": [],
        "trades": [],
        "closed": [],
    }


def cost_factor():
    return 1.0 - COST_BPS / 10000.0


def price_is_stale(ticker):
    """True when this ticker's stocks.json row was refreshed BEFORE the run's own
    snapshot date, i.e. the price is a leftover from an earlier scan.

    Absence from stocks.json was the only staleness the tracker used to recognise;
    an OLD price sitting in the file counted as fresh. That let the book trade at a
    price the rest of the world had already moved past (19 equal_llm trades over
    2026-07/08 filled off a prior session's close, one by 9.3%), and it let a
    delisted name keep a month-old mark inside NAV (CPRX, last_listed 2026-07-19,
    still marked at its 07-19 price on 08-18).

    The reference is the snapshot date the run's own file was built on — the modal
    Last_Updated date, not `as_of`. A calendar comparison against as_of would flag
    every ticker on a Monday run (Friday's close is the correct mark) and would have
    to carry a weekend/holiday tolerance wide enough to let the real staleness back
    through. The scan writes every row inside one short window (28 minutes on the
    2026-08-18 file), so same-date == same scan, and older == genuinely left behind.

    Degrades to "fresh" when the metadata is absent (test fixtures, older files).
    """
    snap = price_asof_holder.get("snapshot_date")
    if not snap:
        return False
    d = (price_asof_holder.get("asof") or {}).get(ticker)
    return bool(d) and d < snap


def mark_price(ticker, prices, ledger):
    """Today's price; falls back to last known mark (flagged stale by caller).

    Stale means "do not trade on this": entrants are skipped and incumbents are not
    trimmed to fund them. NAV is still marked at the price — a stale mark beats no
    mark — and the ticker is surfaced in the day's `stale_marks`.
    """
    p = num(prices.get(ticker))
    if p is not None:
        ledger["last_marks"][ticker] = p
        return p, price_is_stale(ticker)
    last = num(ledger["last_marks"].get(ticker))
    return last, True


def portfolio_value(ledger, prices):
    total = ledger["state"]["cash"]
    stale = []
    for t, h in ledger["state"]["holdings"].items():
        p, is_stale = mark_price(t, prices, ledger)
        if p is None:
            continue  # never had a price (shouldn't happen post-buy)
        total += h["shares"] * p
        if is_stale:
            stale.append(t)
    return total, stale


def buy(ledger, ticker, price, spend, as_of, reason):
    spend = min(spend, ledger["state"]["cash"])
    if spend <= 0 or price is None:
        return
    shares = spend * cost_factor() / price
    ledger["state"]["cash"] -= spend
    ledger["state"]["holdings"][ticker] = {
        "entry_date": as_of, "entry_price": round(price, 4), "shares": shares,
    }
    ledger["trades"].append({"date": as_of, "side": "buy", "ticker": ticker,
                             "price": round(price, 4), "value": round(spend, 4), "reason": reason})


def sell(ledger, ticker, price, as_of, reason):
    h = ledger["state"]["holdings"].pop(ticker, None)
    if h is None:
        return
    if price is None:
        price = h["entry_price"]  # worst case: flat exit at entry (flagged via stale)
    proceeds = h["shares"] * price * cost_factor()
    ledger["state"]["cash"] += proceeds
    ret = (price * cost_factor()) / h["entry_price"] - 1 if h["entry_price"] else None
    hold_days = (date.fromisoformat(as_of) - date.fromisoformat(h["entry_date"])).days
    ledger["trades"].append({"date": as_of, "side": "sell", "ticker": ticker,
                             "price": round(price, 4), "value": round(proceeds, 4), "reason": reason})
    ledger["closed"].append({
        "ticker": ticker, "entry_date": h["entry_date"], "exit_date": as_of,
        "entry_price": h["entry_price"], "exit_price": round(price, 4),
        "return_pct": round(ret * 100, 2) if ret is not None else None,
        "hold_days": hold_days, "post_exit_return_pct": None, "post_exit_days": None,
    })


def trim(ledger, ticker, price, sell_value, as_of, reason):
    """Partial sell to fund a rebalance — reduces shares, keeps the position + entry basis
    (no closed round-trip logged; the position is still open)."""
    h = ledger["state"]["holdings"].get(ticker)
    if not h or price is None or sell_value <= 0:
        return
    sell_value = min(sell_value, h["shares"] * price)
    h["shares"] -= sell_value / price
    ledger["state"]["cash"] += sell_value * cost_factor()
    ledger["trades"].append({"date": as_of, "side": "sell", "ticker": ticker,
                             "price": round(price, 4), "value": round(sell_value * cost_factor(), 4),
                             "reason": reason})
    if h["shares"] * price < 0.01:                    # dust guard
        ledger["state"]["holdings"].pop(ticker, None)


def credit_dividends(ledger, as_of):
    """Cash-credit current holders for ex-dates in (last_nav_date, as_of].

    Approach-B total return: only positions held on the ex-date receive the
    dividend, so a churning ledger captures exactly the dividends it earned. Runs
    after rewind_or_advance on the carried-over (pre-rebalance) holdings, so a
    same-date replay re-credits cleanly against the restored opening state.
    """
    divs = dividends_holder.get("divs") or {}
    if not divs:
        return
    series = ledger.get("nav_series") or []
    last_date = series[-1]["date"] if series else None
    if last_date is None:
        return  # fresh ledger: nothing was held before today
    total = 0.0
    for t, h in ledger["state"]["holdings"].items():
        for ex_date, amt in divs.get(t, ()):  # [[ex_date, per_share_amount], ...]
            if last_date < ex_date <= as_of:
                total += h["shares"] * amt
    if total:
        ledger["state"]["cash"] += total
        ledger.setdefault("dividends", []).append({"date": as_of, "amount": round(total, 4)})


def rewind_or_advance(ledger, as_of):
    """Idempotency: same-date rerun rewinds to the day's opening state."""
    if ledger["current_date"] == as_of and ledger["prev_day_state"] is not None:
        ledger["state"] = copy.deepcopy(ledger["prev_day_state"])
        ledger["nav_series"] = [r for r in ledger["nav_series"] if r["date"] != as_of]
        ledger["trades"] = [t for t in ledger["trades"] if t["date"] != as_of]
        ledger["closed"] = [c for c in ledger["closed"] if c["exit_date"] != as_of]
        ledger["dividends"] = [d for d in ledger.get("dividends", []) if d["date"] != as_of]
    else:
        ledger["prev_day_state"] = copy.deepcopy(ledger["state"])
        ledger["current_date"] = as_of


def run_target_ledger(ledger, targets, prices, as_of, reason_prefix, unknown=frozenset()):
    """plan/equal ledgers: trade-on-change toward a {ticker: weight_pct} target set.

    `unknown` = held names the upstream engine did not evaluate this run. They are
    NOT leavers: absence of a verdict is not a verdict. They are carried unchanged.
    Callers derive it from the source (see evaluated_quant / evaluated_llm); when the
    source itself is unhealthy the caller holds the whole ledger instead (see
    factor_healthy / targets_healthy), so no portfolio-shaped "collapse" heuristic is
    needed here.

    Remaining guard — exit grace: a held name must be missing from the target set on 2
    consecutive runs before it is sold, so a one-day flap around the band cliff causes
    zero churn. (A buffer/hysteresis band at the signal would make this redundant.)
    Missed ENTRIES need no guard: the target is recomputed every run, so a name skipped on an
    absent/stale mark is simply retried at the next run with a fresh price.
    """
    rewind_or_advance(ledger, as_of)
    credit_dividends(ledger, as_of)  # pay holders before today's rebalance
    held = set(ledger["state"]["holdings"])
    target_set = set(targets)
    leavers = held - target_set - set(unknown)

    carried = held & set(unknown)
    if carried:
        print(f"  ! {reason_prefix}: {len(carried)} held name(s) not evaluated this run "
              f"— carried unchanged: {sorted(carried)}", file=sys.stderr)

    # exit grace: first miss arms the exit, the second consecutive miss executes it.
    # (exit_pending survives same-day reruns: entries are only cleared when the name returns
    # to the target set, so a rewound rerun still sells deterministically.)
    pending = ledger.setdefault("exit_pending", {})
    for t in sorted(leavers):
        first = pending.get(t)
        if first is None or first == as_of:
            pending.setdefault(t, as_of)
            continue                       # first miss: hold one more run (flap guard)
        p, _ = mark_price(t, prices, ledger)
        sell(ledger, t, p, as_of, f"left_{reason_prefix}")
    for t in list(pending):                # back in the target set -> disarm
        if t in target_set:
            pending.pop(t, None)
    for t in carried:
        # An unevaluated run is not a miss. Clearing the arm means the grace period
        # counts 2 consecutive *evaluated* misses; otherwise a name armed yesterday
        # and unknown today would sell the instant it is graded again, skipping it.
        pending.pop(t, None)

    nav, _ = portfolio_value(ledger, prices)
    entrants = []
    for t in sorted(target_set - held):
        p, stale = mark_price(t, prices, ledger)
        if p is None or stale:
            continue  # never open a position on a stale/absent mark
        entrants.append(t)

    # Fund entrants when cash is short: trim overweight incumbents toward their target weight.
    need = sum(targets[t] / 100.0 * nav for t in entrants)
    shortfall = need - ledger["state"]["cash"]
    if entrants and shortfall > 0:
        for t in sorted(held & target_set):
            if shortfall <= 0:
                break
            p, stale = mark_price(t, prices, ledger)
            if p is None or stale:
                continue
            h = ledger["state"]["holdings"].get(t)
            if not h:
                continue
            excess = h["shares"] * p - targets[t] / 100.0 * nav
            if excess <= 0:
                continue
            take = min(excess, shortfall)
            trim(ledger, t, p, take, as_of, f"rebalance_{reason_prefix}")
            shortfall -= take

    # If trimming could not raise the full amount (incumbents stale, so unpriceable
    # and untrimmable), buy() clamps each spend to whatever cash is left and returns
    # silently — starving whoever sorts last. UFPT sat outside a 22-name target set
    # for a full day this way, with no warning anywhere.
    #
    # Fund at FULL target weight or not at all. A partially-funded entrant would stay
    # underweight forever: this function only ever trims overweights, so nothing tops
    # a position back up. A deferred name is simply an entrant again next run, when an
    # exit or a fresh price has freed the cash — that self-heals; a token position does
    # not. Either way the shortfall is now loud.
    deferred = []
    for t in entrants:
        p, _ = mark_price(t, prices, ledger)
        target_spend = targets[t] / 100.0 * nav
        # buy() clamps spend to cash, so this must gate on (near) the FULL amount:
        # gating on a fraction and then asking for the full spend just re-creates the
        # partial position by another route.
        if p is None or ledger["state"]["cash"] < target_spend * ENTRY_FUND_TOL:
            deferred.append(t)
            continue
        buy(ledger, t, p, target_spend, as_of, f"entered_{reason_prefix}")
    if deferred:
        ledger["underfunded_entrants"] = {"date": as_of, "tickers": sorted(deferred)}
        print(f"  ! {reason_prefix}: cash short — {len(deferred)} entrant(s) DEFERRED to the "
              f"next run: {sorted(deferred)}. The ledger is underweight its own target set.",
              file=sys.stderr)
    else:
        ledger.pop("underfunded_entrants", None)

    nav, stale = portfolio_value(ledger, prices)
    return nav, stale


def hold_ledger(ledger, prices, as_of):
    """Advance the day and mark NAV without trading. Used when the upstream source
    that defines this ledger's target set is unhealthy or absent."""
    rewind_or_advance(ledger, as_of)
    credit_dividends(ledger, as_of)
    return portfolio_value(ledger, prices)


def top_up(ledger, ticker, price, spend, as_of, reason):
    """Add to an existing position (plan3 band rebalance). Entry basis becomes the
    weighted average so the closed-trade return stays honest."""
    h = ledger["state"]["holdings"].get(ticker)
    spend = min(spend, ledger["state"]["cash"])
    if not h or price is None or spend <= 0:
        return
    new_shares = spend * cost_factor() / price
    total = h["shares"] + new_shares
    h["entry_price"] = round((h["entry_price"] * h["shares"] + price * new_shares) / total, 4)
    h["shares"] = total
    ledger["state"]["cash"] -= spend
    ledger["trades"].append({"date": as_of, "side": "buy", "ticker": ticker,
                             "price": round(price, 4), "value": round(spend, 4), "reason": reason})


def plan3_risk_tier(state, dd):
    """Kill-switch tier from ledger drawdown, with hysteresis on recovery."""
    tier = state.get("risk_tier", 1.0)
    if dd <= PLAN3_DD_QUARTER:
        tier = min(tier, 0.25)
    elif dd <= PLAN3_DD_HALF:
        tier = min(tier, 0.5)
    if tier == 0.25 and dd > PLAN3_DD_QUARTER + PLAN3_TIER_HYSTERESIS:
        tier = 0.5
    if tier == 0.5 and dd > PLAN3_DD_HALF + PLAN3_TIER_HYSTERESIS:
        tier = 1.0
    state["risk_tier"] = tier
    return tier


def run_plan3_ledger(ledger, plan, prices, as_of):
    """plan3 · bold: momentum targets from portfolio_plan_momo.json, with the
    defense layers the flat target-set ledgers don't have (see constants above).

    Unlike run_target_ledger this DOES rebalance held names toward target — cash
    here is an explicit regime decision (gross throttle x kill-switch tier), never
    a residual — but only outside a +/-25% band so drift doesn't churn."""
    rewind_or_advance(ledger, as_of)
    credit_dividends(ledger, as_of)
    st = ledger["state"]
    st.setdefault("hwm", {})
    st.setdefault("cooldown", {})
    st.setdefault("risk_tier", 1.0)
    st.setdefault("halted", False)

    if st["halted"]:
        return portfolio_value(ledger, prices)  # flat until the user resets the halt

    # 1 ── high-water marks, then trailing stops (fresh marks only; a stale mark
    # can neither raise the water line nor fire a stop)
    for t in list(st["holdings"]):
        p, stale = mark_price(t, prices, ledger)
        if p is None or stale:
            continue
        hw = max(st["hwm"].get(t, p), p)
        st["hwm"][t] = hw
        if p <= hw * (1.0 - PLAN3_TRAIL_STOP):
            sell(ledger, t, p, as_of, "stop_plan3")
            st["cooldown"][t] = as_of
            st["hwm"].pop(t, None)

    # 2 ── kill switch on the ledger's own drawdown from peak NAV. A manual halt
    # reset rebases the peak (state.peak_since) — otherwise the very next run
    # would measure dd from the pre-crash peak and re-halt instantly.
    nav, _ = portfolio_value(ledger, prices)
    since = st.get("peak_since")
    prior_navs = [r["nav"] for r in ledger["nav_series"]
                  if r.get("nav") is not None and (not since or r["date"] >= since)]
    peak = max(prior_navs + [nav] + ([] if since else [START_NAV]))
    dd = nav / peak - 1.0
    if dd <= PLAN3_DD_KILL:
        for t in sorted(st["holdings"]):
            p, _ = mark_price(t, prices, ledger)
            sell(ledger, t, p, as_of, "killswitch_plan3")
        st["halted"] = True
        st["risk_tier"] = 0.0
        st["hwm"] = {}
        print(f"  ! plan3: KILL SWITCH — drawdown {dd:.1%} breached {PLAN3_DD_KILL:.0%}; "
              f"book liquidated and HALTED (reset via --reset-plan3-halt)", file=sys.stderr)
        return portfolio_value(ledger, prices)
    tier = plan3_risk_tier(st, dd)

    # 3 ── target set: momentum plan x cooldown filter
    targets = {p["symbol"]: p["weight_pct"] for p in (plan.get("positions") or [])}
    for t, stop_date in list(st["cooldown"].items()):
        age = (date.fromisoformat(as_of) - date.fromisoformat(stop_date)).days
        if age >= PLAN3_COOLDOWN_DAYS:
            st["cooldown"].pop(t)          # served its time
        else:
            targets.pop(t, None)           # still banned from re-entry
    gross = (plan.get("regime") or {}).get("gross_exposure_pct", 100.0) / 100.0 * tier

    # 4 ── leavers (rank decay), with the same 2-consecutive-runs exit grace as
    # the other ledgers so a one-week flap around rank #13 causes zero churn
    held = set(st["holdings"])
    target_set = set(targets)
    pending = ledger.setdefault("exit_pending", {})
    for t in sorted(held - target_set):
        first = pending.get(t)
        if first is None or first == as_of:
            pending.setdefault(t, as_of)
            continue
        p, _ = mark_price(t, prices, ledger)
        sell(ledger, t, p, as_of, "left_plan3")
        st["hwm"].pop(t, None)
    for t in list(pending):
        if t in target_set:
            pending.pop(t, None)

    # 5 ── band rebalance toward target value = weight x nav x gross.
    # Trims first (they raise the cash the buys need), then entrants, then top-ups.
    nav, _ = portfolio_value(ledger, prices)
    for t in sorted(set(st["holdings"]) & target_set):
        p, stale = mark_price(t, prices, ledger)
        if p is None or stale:
            continue
        h = st["holdings"][t]
        value = h["shares"] * p
        target_value = targets[t] / 100.0 * nav * gross
        if value > target_value * (1 + PLAN3_REBAL_BAND) \
                and value - target_value > PLAN3_MIN_TRADE:
            trim(ledger, t, p, value - target_value, as_of, "rebalance_plan3")

    entrants = []
    for t in sorted(target_set - set(st["holdings"])):
        p, stale = mark_price(t, prices, ledger)
        if p is None or stale:
            continue  # never open on a stale/absent mark
        target_value = targets[t] / 100.0 * nav * gross
        if target_value <= PLAN3_MIN_TRADE:
            continue  # throttled to dust (e.g. quarter gross): defer, don't churn
        entrants.append((t, p, target_value))
    # Entrant funding beats the drift band: when cash is short, trim incumbents
    # toward their exact target (mirrors run_target_ledger's funding pass) —
    # otherwise a name whose value sits just inside the band pins the cash and
    # a returning entrant starves indefinitely.
    shortfall = sum(tv for _, _, tv in entrants) - st["cash"]
    if entrants and shortfall > 0:
        for t in sorted(set(st["holdings"]) & target_set):
            if shortfall <= 0:
                break
            p, stale = mark_price(t, prices, ledger)
            if p is None or stale:
                continue
            excess = st["holdings"][t]["shares"] * p - targets[t] / 100.0 * nav * gross
            if excess <= 0:
                continue
            take = min(excess, shortfall)
            trim(ledger, t, p, take, as_of, "rebalance_plan3")
            shortfall -= take
    for t, p, target_value in entrants:
        if st["cash"] < target_value * ENTRY_FUND_TOL:
            continue  # still underfunded: it is simply an entrant again next run
        buy(ledger, t, p, target_value, as_of, "entered_plan3")
        st["hwm"][t] = p

    for t in sorted(set(st["holdings"]) & target_set):
        p, stale = mark_price(t, prices, ledger)
        if p is None or stale:
            continue
        h = st["holdings"][t]
        value = h["shares"] * p
        target_value = targets[t] / 100.0 * nav * gross
        shortfall = target_value - value
        if value < target_value * (1 - PLAN3_REBAL_BAND) and shortfall > PLAN3_MIN_TRADE:
            top_up(ledger, t, p, min(shortfall, st["cash"]), as_of, "rebalance_plan3")

    return portfolio_value(ledger, prices)


def content_age_hours(generated_at):
    """Age of a producer's own timestamp. File mtime is useless — a git checkout
    resets it even on stale content."""
    if not generated_at:
        return None
    try:
        ts = datetime.fromisoformat(str(generated_at).replace("Z", "+00:00"))
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - ts).total_seconds() / 3600.0


def factor_healthy(factor_raw, book, as_of):
    """Validate factor_scores.json directly. Returns (ok, reason).

    Checks the INPUT, never the portfolio's reaction to it: content freshness, and
    scored_count against the last run that passed. A truncated or stale file trades
    nothing; a genuine mass demotion trades immediately.
    """
    age = content_age_hours(factor_raw.get("generated_at"))
    if age is None:
        return False, "factor_scores.json has no parseable generated_at"
    if age > FACTOR_MAX_AGE_H:
        return False, f"factor_scores.json is {age:.1f}h old (max {FACTOR_MAX_AGE_H}h)"
    scored = factor_raw.get("scored_count")
    if not scored:
        return False, "factor_scores.json reports scored_count=0"
    last_good = (book.get("health") or {}).get("factor_scored_count")
    if last_good and scored < last_good * SCORED_COUNT_MIN_RATIO:
        return False, (f"scored_count collapsed: {scored} vs {last_good} last healthy run "
                       f"(< {SCORED_COUNT_MIN_RATIO:.0%})")
    return True, ""


def targets_healthy(name, targets, ledger):
    """An empty target set for a ledger that holds positions is a producer failure,
    not an instruction to liquidate. (This is the deterministic replacement for the
    'target set vanished' arm of the old collapse breaker.)"""
    if not targets and ledger["state"]["holdings"]:
        return False, f"{name}: target set is empty while holding " \
                      f"{len(ledger['state']['holdings'])} names"
    return True, ""


def run_mine_ledger(ledger, snapshot, prices, as_of):
    """Unitized ledger of the user's actual holdings."""
    rewind_or_advance(ledger, as_of)
    credit_dividends(ledger, as_of)  # pay holders before applying today's snapshot
    state = ledger["state"]

    # Mark existing book first (pre-flow value)
    pre_value = state["cash"]
    for t, h in state["holdings"].items():
        p, _ = mark_price(t, prices, ledger)
        pre_value += h["shares"] * (p if p is not None else h["entry_price"])

    if state["units"] is None:
        # Inception of the mine ledger: requires a snapshot
        if not snapshot:
            return None, []
        state["cash"] = float(snapshot.get("cash") or 0)
        state["holdings"] = {}
        for h in snapshot.get("holdings", []):
            t = (h.get("ticker") or "").upper()
            v = num(h.get("value"))
            p, stale = mark_price(t, prices, ledger)
            if not t or v is None:
                continue
            if p is None:
                state["cash"] += v  # can't price it: hold as cash, honest
                continue
            state["holdings"][t] = {"entry_date": as_of, "entry_price": round(p, 4),
                                    "shares": v / p}
        total = state["cash"] + sum(
            h["shares"] * ledger["last_marks"].get(t, h["entry_price"])
            for t, h in state["holdings"].items())
        state["units"] = total / START_NAV if total > 0 else None
        if state["units"] is None:
            return None, []
        nav_pu = START_NAV
    else:
        nav_pu = pre_value / state["units"] if state["units"] else None
        if snapshot and snapshot.get("saved_at_date") == as_of:
            # User updated holdings today: diff = trades; value delta = flow (units move)
            new_holdings = {}
            new_cash = float(snapshot.get("cash") or 0)
            new_value = new_cash
            for h in snapshot.get("holdings", []):
                t = (h.get("ticker") or "").upper()
                v = num(h.get("value"))
                p, _ = mark_price(t, prices, ledger)
                if not t or v is None:
                    continue
                if p is None:
                    new_cash += v
                    new_value += v
                    continue
                prev = state["holdings"].get(t)
                new_holdings[t] = {
                    "entry_date": prev["entry_date"] if prev else as_of,
                    "entry_price": prev["entry_price"] if prev else round(p, 4),
                    "shares": v / p,
                }
                new_value += v
                if prev is None:
                    ledger["trades"].append({"date": as_of, "side": "buy", "ticker": t,
                                             "price": round(p, 4), "value": round(v, 4),
                                             "reason": "user_edit"})
            for t in set(state["holdings"]) - set(new_holdings):
                p, _ = mark_price(t, prices, ledger)
                ledger["trades"].append({"date": as_of, "side": "sell", "ticker": t,
                                         "price": round(p, 4) if p else None, "value": None,
                                         "reason": "user_edit"})
            flow = new_value - pre_value
            if nav_pu and abs(flow) > 1e-9:
                state["units"] += flow / nav_pu  # deposits/withdrawals move units, not NAV
            state["holdings"] = new_holdings
            state["cash"] = new_cash

    value = state["cash"]
    stale = []
    for t, h in state["holdings"].items():
        p, is_stale = mark_price(t, prices, ledger)
        value += h["shares"] * (p if p is not None else h["entry_price"])
        if is_stale:
            stale.append(t)
    nav_pu = value / state["units"] if state["units"] else None
    return nav_pu, stale


def fetch_benchmarks():
    """Latest close for each benchmark ETF -> {sym: price|None}."""
    out = {b: None for b in BENCHMARKS}
    try:
        import yfinance as yf
        for b in BENCHMARKS:
            try:
                hist = yf.Ticker(b).history(period="5d", interval="1d")
                if hist is not None and not hist.empty:
                    out[b] = round(float(hist["Close"].dropna().iloc[-1]), 4)
            except Exception as e:
                print(f"  {b} fetch failed: {e}", file=sys.stderr)
    except Exception as e:
        print(f"  benchmark fetch failed: {e}", file=sys.stderr)
    return out


bench_hist_holder = {}  # {sym: {date: close}} fetched once per run for backfill


def fetch_benchmark_history(start_date):
    """Daily closes for every benchmark from start_date -> today: {sym: {date: close}}.
    Lets benchmarks added after inception (e.g. SOXX/DRAM) be backfilled to the
    common start date so every selected ETF is indexed from the same point."""
    out = {b: {} for b in BENCHMARKS}
    try:
        import yfinance as yf
        for b in BENCHMARKS:
            try:
                hist = yf.Ticker(b).history(start=start_date, interval="1d")
                if hist is not None and not hist.empty:
                    for idx, c in hist["Close"].dropna().items():
                        d = idx.date().isoformat() if hasattr(idx, "date") else str(idx)[:10]
                        out[b][d] = round(float(c), 4)
            except Exception as e:
                print(f"  {b} history failed: {e}", file=sys.stderr)
    except Exception as e:
        print(f"  benchmark history fetch failed: {e}", file=sys.stderr)
    return out


def backfill_benches(ledger):
    """Fill any missing benchmark close in this ledger's nav_series from the
    fetched history, so a late-added benchmark spans the full record (not just
    from when it was first added)."""
    hist = bench_hist_holder.get("hist") or {}
    if not hist:
        return
    for r in ledger.get("nav_series", []):
        b = r.setdefault("benches", {})
        for sym, by_date in hist.items():
            if b.get(sym) is None and r["date"] in by_date:
                b[sym] = by_date[r["date"]]


def compute_summary(nav_series, trades, closed, inception):
    rows = [r for r in nav_series if r.get("nav") is not None]
    if len(rows) < 1:
        return {"observations": 0}
    navs = [r["nav"] for r in rows]
    n = len(navs)
    days = max(1, (date.fromisoformat(rows[-1]["date"]) - date.fromisoformat(inception)).days)
    cum = navs[-1] / START_NAV - 1
    cagr = (navs[-1] / START_NAV) ** (365.0 / days) - 1 if days >= 30 else None
    peak, maxdd = navs[0], 0.0
    for v in navs:
        peak = max(peak, v)
        maxdd = min(maxdd, v / peak - 1)
    sharpe = None
    if n >= 21:
        rets = [navs[i] / navs[i - 1] - 1 for i in range(1, n)]
        mean = sum(rets) / len(rets)
        var = sum((x - mean) ** 2 for x in rets) / (len(rets) - 1)
        if var > 0:
            sharpe = round(mean / math.sqrt(var) * math.sqrt(252), 2)
    # Excess return vs each benchmark over the same window
    excess_vs = {}
    for b in BENCHMARKS:
        b_rows = [r for r in rows if (r.get("benches") or {}).get(b) is not None]
        if b_rows:
            b0, b1 = b_rows[0]["benches"][b], b_rows[-1]["benches"][b]
            if b0:
                excess_vs[b] = round((cum - (b1 / b0 - 1)) * 100, 2)
    excess = excess_vs.get(PRIMARY_BENCHMARK)
    wins = [c for c in closed if c.get("return_pct") is not None]
    traded = sum(t.get("value") or 0 for t in trades)
    return {
        "observations": n,
        "inception": inception,
        "cumulative_return_pct": round(cum * 100, 2),
        "cagr_pct": round(cagr * 100, 2) if cagr is not None else None,
        "max_drawdown_pct": round(maxdd * 100, 2),
        "sharpe": sharpe,
        "excess_vs_bench_pct": excess,
        "excess_vs": excess_vs,
        "closed_trades": len(wins),
        "win_rate_pct": round(100 * sum(1 for c in wins if c["return_pct"] > 0) / len(wins), 1) if wins else None,
        "avg_hold_days": round(sum(c["hold_days"] for c in closed) / len(closed), 1) if closed else None,
        "total_traded_value": round(traded, 2),
        "open_positions": None,  # filled by caller
    }


def backfill_post_exit(ledger, prices, as_of):
    for c in ledger["closed"]:
        if c["post_exit_return_pct"] is not None or c.get("exit_price") in (None, 0):
            continue
        elapsed = (date.fromisoformat(as_of) - date.fromisoformat(c["exit_date"])).days
        if elapsed >= POST_EXIT_DAYS:
            p = num(prices.get(c["ticker"]))
            if p is not None:
                c["post_exit_return_pct"] = round((p / c["exit_price"] - 1) * 100, 2)
                c["post_exit_days"] = elapsed


def finalize_ledger(led, nav, stale, benches, as_of, inception):
    """Append today's NAV point, backfill post-exit marks, recompute summary."""
    led["nav_series"].append({"date": as_of, "nav": round(nav, 4) if nav is not None else None,
                              "bench": benches.get(PRIMARY_BENCHMARK),  # back-compat (IWM)
                              "benches": benches, "stale_marks": stale})
    backfill_post_exit(led, prices_holder.get("prices", {}), as_of)
    led["summary"] = compute_summary(led["nav_series"], led["trades"], led["closed"], inception)
    led["summary"]["open_positions"] = len(led["state"]["holdings"])


# prices are passed explicitly everywhere except backfill inside finalize_ledger;
# stash them so finalize_ledger can reach the current run's marks without threading
# the arg through every caller.
prices_holder = {}


def process_user_mine_ledgers(prices, benches, as_of):
    """Per-user `mine` ledgers (multi-user). Reads every saved snapshot from
    my_portfolio (service key), advances each user's mine ledger held in
    user_mine_ledgers, and writes it back. Each user's ledger inceptions on the
    first run that sees their snapshot. Returns a count for logging.
    """
    rows = sb_get("my_portfolio?select=user_id,holdings,cash,saved_at")
    if not rows:
        return 0
    done = 0
    for snap in rows:
        uid = snap.get("user_id")
        if not uid:
            continue
        if snap.get("saved_at"):
            snap["saved_at_date"] = snap["saved_at"][:10]
        existing = sb_get(f"user_mine_ledgers?user_id=eq.{uid}&select=data") or []
        stored = existing[0]["data"] if existing else None
        led = stored["ledger"] if stored and "ledger" in stored else empty_ledger()
        inception = (stored or {}).get("inception") or as_of
        nav, stale = run_mine_ledger(led, snap, prices, as_of)
        finalize_ledger(led, nav, stale, benches, as_of, inception)
        backfill_benches(led)  # late-added benchmarks -> full record
        sb_upsert("user_mine_ledgers",
                  {"user_id": uid, "data": {"ledger": led, "inception": inception},
                   "updated_at": datetime.now(timezone.utc).isoformat()},
                  "user_id")
        done += 1
    return done


def main():
    parser = argparse.ArgumentParser(description="Update live paper-trading ledgers.")
    parser.add_argument("--as-of", type=str, default=None, help="Override date (YYYY-MM-DD, testing)")
    parser.add_argument("--stocks-json", type=str, default=None, help="Override stocks.json path (testing)")
    parser.add_argument("--skip-benchmark", action="store_true", help="No yfinance call (testing)")
    parser.add_argument("--mine-only", action="store_true",
                        help="Advance ONLY per-user mine ledgers; never touch plan/plan2/equal "
                             "(on-demand refresh must not re-stamp the global ledgers).")
    parser.add_argument("--reset-plan3-halt", action="store_true",
                        help="Clear plan3's kill-switch halt (deliberate user action after a "
                             "-20%% drawdown liquidation; the ledger re-enters from cash).")
    args = parser.parse_args()
    as_of = args.as_of or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Held-book / underfunded events for the run. Written to the ledger book as an
    # `alerts` block (-> Supabase -> site banner) so the pipeline keeps committing
    # the day's data; see the note at the end of main() for why not a nonzero exit.
    alerts = []
    guard_tripped = []  # subset that caused a ledger to hold (for the stderr summary)

    stocks_path = Path(args.stocks_json) if args.stocks_json else STOCKS_JSON
    stocks = load_json(stocks_path, [])
    prices = {s["symbol"]: s.get("price") for s in stocks if s.get("symbol")}
    prices_holder["prices"] = prices
    # Price freshness: modal Last_Updated date == the date this scan ran; anything
    # older is a row the scan failed to refresh. See price_is_stale.
    asof_map = {s["symbol"]: str(s["Last_Updated"])[:10] for s in stocks
                if s.get("symbol") and s.get("Last_Updated")}
    snapshot_date = (collections.Counter(asof_map.values()).most_common(1)[0][0]
                     if asof_map else None)
    price_asof_holder["asof"] = asof_map
    price_asof_holder["snapshot_date"] = snapshot_date
    if snapshot_date:
        behind = sum(1 for d in asof_map.values() if d < snapshot_date)
        print(f"  · price snapshot {snapshot_date}: {behind}/{len(asof_map)} ticker(s) "
              f"carry an older mark and are untradable this run", file=sys.stderr)
        if snapshot_date > as_of:
            print(f"  ! price snapshot {snapshot_date} is AHEAD of as_of {as_of} — "
                  f"marks postdate the ledger date", file=sys.stderr)
            alerts.append({"date": as_of, "severity": "error", "scope": "prices",
                           "kind": "snapshot_ahead",
                           "detail": f"stocks.json snapshot {snapshot_date} > as_of {as_of}"})
    dividends_holder["divs"] = (load_json(DIVIDENDS_JSON, {}) or {}).get("tickers", {})
    book = load_json(LEDGERS_JSON, None) or {
        "inception": as_of,
        "config": {"cost_bps": COST_BPS, "benchmarks": BENCHMARKS,
                   "primary_benchmark": PRIMARY_BENCHMARK, "start_nav": START_NAV},
        "ledgers": {"equal": empty_ledger()},
    }
    # plan / plan2 / plan3 (retired 2026-08-27) and the *_llm lane (retired 2026-08-26)
    # are NO LONGER computed or seeded on new books. Pre-existing books keep their frozen
    # history (setdefault never removes). The live books are `equal` + `rn_depth`.
    for _k in ("rn_depth",):
        book["ledgers"].setdefault(_k, empty_ledger())  # add to pre-existing books
    book["ledgers"].pop("mine", None)  # mine is per-user now (user_mine_ledgers)
    book.setdefault("config", {})["benchmarks"] = BENCHMARKS
    book["config"]["primary_benchmark"] = PRIMARY_BENCHMARK
    # config.cost_bps is what the SITE reports and what the what-if commission
    # overlay treats as already-charged. It was only ever written at book creation,
    # so it still said 10 after COST_BPS moved to 25 on 2026-07-20: the site
    # understated the drag, and re-costing to 25bps in the UI added a second 15bps
    # on top of the 25 the ledger had already taken. Restamp it every run.
    book["config"]["cost_bps"] = COST_BPS
    book["config"]["start_nav"] = START_NAV
    ledgers = book["ledgers"]

    benches = {b: None for b in BENCHMARKS} if args.skip_benchmark else fetch_benchmarks()
    bench_hist_holder["hist"] = {} if args.skip_benchmark else fetch_benchmark_history(book["inception"])

    # ── global ledgers: plan / plan2 / equal (identical for every user) ──
    # Skipped under --mine-only so an on-demand mine refresh never re-stamps the
    # global ledgers with stale prices (that produced frozen NAV tails). The
    # global book is left exactly as loaded; only the daily/weekly chain advances it.
    if not args.mine_only:
        factor_raw = load_json(FACTOR_SCORES_JSON, {}) or {}
        factor = factor_raw.get("tickers", {})
        fct_ok, fct_why = factor_healthy(factor_raw, book, as_of)
        if not fct_ok:
            print(f"  ! factor_scores unhealthy: {fct_why} — equal/rn_depth hold", file=sys.stderr)
            alerts.append({"date": as_of, "severity": "error", "scope": "factor_scores",
                           "detail": fct_why})
            guard_tripped.append(f"factor_scores: {fct_why}")

        def run_or_hold(name, targets, prefix, unknown=frozenset(), source_ok=True, why=""):
            """Trade only when the source that defines this target set is healthy."""
            led = ledgers[name]
            ok, reason = (source_ok, why) if not source_ok else targets_healthy(name, targets, led)
            if not ok:
                print(f"  ! {name}: holding book unchanged — {reason}", file=sys.stderr)
                alerts.append({"date": as_of, "severity": "error", "scope": name,
                               "kind": "held", "detail": reason})
                if reason not in guard_tripped:
                    guard_tripped.append(reason)
                return hold_ledger(led, prices, as_of)
            nav_stale = run_target_ledger(led, targets, prices, as_of, prefix, unknown=unknown)
            uf = led.get("underfunded_entrants")
            if uf and uf.get("date") == as_of:
                alerts.append({"date": as_of, "severity": "warn", "scope": name,
                               "kind": "underfunded", "detail": f"deferred: {uf['tickers']}"})
            if unknown & set(led["state"]["holdings"]):
                carried = sorted(unknown & set(led["state"]["holdings"]))
                alerts.append({"date": as_of, "severity": "info", "scope": name,
                               "kind": "unevaluated_held", "detail": f"carried: {carried}"})
            return nav_stale

        # plan / plan2 RETIRED 2026-08-27 — no longer computed. build_portfolio_plan.py still
        # writes portfolio_plan.json for the Portfolio tab's suggested plan, but the plan/plan2
        # paper ledgers are frozen in paper_ledgers.json. The live quant book is `equal`.

        # A held name the quant engine did not band today is unknown, not demoted.
        unknown_quant = {t for t in ledgers["equal"]["state"]["holdings"]
                         if not evaluated_quant(factor.get(t))}
        research = sorted(t for t, e in factor.items() if e.get("fct_band") == "research_now")
        eq_weight = 100.0 / max(len(research), MIN_EQUAL_NAMES) if research else 0   # #8 cash residual when few
        nav_eq, stale_eq = run_or_hold("equal", {t: eq_weight for t in research}, "rank",
                                       unknown=unknown_quant, source_ok=fct_ok, why=fct_why)
        finalize_ledger(ledgers["equal"], nav_eq, stale_eq, benches, as_of, book["inception"])
        backfill_benches(ledgers["equal"])  # late-added benchmarks -> full record

        # ── LLM-overlay variants (plan_llm / plan2_llm / equal_llm): RETIRED ──
        # The old conviction/MoS LLM A/B lane (fed by portfolio_plan_llm.json +
        # fct_band_llm, with the F-04 hysteresis) was retired in the depth migration
        # (2026-08-26). rn_depth (below) is the depth paper book now. The three
        # ledgers stay in paper_ledgers.json with their history frozen — no longer
        # recomputed, never liquidated, just not advanced.

        # ── rn_depth: the site's RESEARCH NOW panel, equally weighted ────────
        # Held (not liquidated) when the depth file is missing or empty, same as
        # the LLM ledgers treat an absent overlay: no depth run today is a known
        # state, not a verdict that every name left the panel.
        depth_raw = load_json(DEPTH_OVERLAY_JSON, {}) or {}
        depth_tk = depth_raw.get("tickers", {})
        rn_targets = depth_targets(factor, depth_tk)
        depth_ok = bool(depth_tk) and fct_ok
        depth_why = fct_why if not fct_ok else (
            "depth_overlay.json missing or empty" if not depth_tk else "")
        unknown_depth = {t for t in ledgers["rn_depth"]["state"]["holdings"]
                         if t not in depth_tk}
        nav_rn, stale_rn = run_or_hold("rn_depth", rn_targets, "rank",
                                       unknown=unknown_depth, source_ok=depth_ok,
                                       why=depth_why)
        if rn_targets:
            print(f"  · rn_depth: {len(rn_targets)} name(s) from depth_overlay "
                  f"(generated_at={depth_raw.get('generated_at')})", file=sys.stderr)
        finalize_ledger(ledgers["rn_depth"], nav_rn, stale_rn, benches, as_of, book["inception"])
        backfill_benches(ledgers["rn_depth"])

        # ── plan3 · bold (momentum sleeve): RETIRED 2026-08-27 ──────────────────
        # No longer computed. run_plan3_ledger + the kill-switch machinery stay defined
        # (still exercised by test_plan3_guards.py); main() simply no longer advances the
        # plan3 ledger. Its history is frozen in paper_ledgers.json. build_momo_plan.py may
        # still write portfolio_plan_momo.json; it is now unused. --reset-plan3-halt is a no-op.

        # Watermark only advances on a healthy run, so a collapse cannot ratchet the
        # baseline down one bad day at a time until the gate stops catching anything.
        if fct_ok:
            book.setdefault("health", {})["factor_scored_count"] = factor_raw.get("scored_count")
            book["health"]["factor_checked_at"] = as_of

        # Alerts block: this run's held/underfunded/carried events, plus any recent
        # ones kept for the site banner. Cleared entries older than the window so a
        # one-off stale day stops showing once it recovers.
        prior = [a for a in (book.get("alerts") or [])
                 if a.get("date") != as_of
                 and (date.fromisoformat(as_of) - date.fromisoformat(a["date"])).days <= ALERT_RETENTION_DAYS]
        book["alerts"] = prior + alerts

        book["last_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        LEDGERS_JSON.write_text(json.dumps(book, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        save_ledgers_to_supabase(book)  # runtime source for /api/paper-ledgers (no redeploy)

    # ── mine ledgers (per-user in Supabase; single local user in dev) ────
    if all(supabase_env()):
        n_users = process_user_mine_ledgers(prices, benches, as_of)
        mine_note = f"{n_users} user mine-ledger(s) -> Supabase"
    else:
        my_snapshot = load_json(MY_PORTFOLIO_JSON, None)
        if my_snapshot and my_snapshot.get("saved_at"):
            my_snapshot["saved_at_date"] = my_snapshot["saved_at"][:10]
        mine = book["ledgers"].setdefault("mine", empty_ledger())
        nav_mine, stale_mine = run_mine_ledger(mine, my_snapshot, prices, as_of)
        finalize_ledger(mine, nav_mine, stale_mine, benches, as_of, book["inception"])
        LEDGERS_JSON.write_text(json.dumps(book, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        mine_note = "local mine ledger (dev, no Supabase env)"

    print(f"Paper ledgers @ {as_of}{' (--mine-only)' if args.mine_only else ''}:")
    if not args.mine_only:
        for name in ("equal", "rn_depth"):
            if not ledgers.get(name, {}).get("nav_series"):
                continue
            s = ledgers[name]["summary"]
            nav_now = ledgers[name]["nav_series"][-1]["nav"]
            print(f"  {name:10s} nav={nav_now} open={s.get('open_positions')} "
                  f"cum={s.get('cumulative_return_pct')}% trades={len(ledgers[name]['trades'])}")
    print(f"  mine: {mine_note}")
    print(f"Written: {LEDGERS_JSON.name}")
    if guard_tripped:
        # Surfaced to the user via the ledger's `alerts` block (Supabase -> site
        # banner), NOT by failing the process: this script is the last step of
        # run_chain, whose nonzero exit would skip the daily Commit-and-Push and
        # discard the whole day's scoring outputs (price_history, paradigm_scores,
        # ...). The ledgers are already written and mirrored; alerting belongs in
        # the data, where the user actually looks.
        print("  ! held-book alerts recorded (see paper_ledgers.alerts): "
              + "; ".join(guard_tripped), file=sys.stderr)


if __name__ == "__main__":
    main()
