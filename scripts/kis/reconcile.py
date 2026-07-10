"""Pure reconciliation logic: target weights + account state -> order list.

No I/O, no API calls — fully unit-testable. The sync CLI feeds it live data.

Principles:
  - Reconcile to weights, never replay trades: missed runs, partial fills and
    rejects self-heal on the next run.
  - Whole shares only (KIS overseas API has no fractional orders).
  - Full exits always sell (that's the point of mirroring in/outs), even when
    the position value is below the churn threshold.
  - Sells first, buys capped by cash expected after sells.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class Order:
    side: str           # "buy" | "sell"
    ticker: str
    qty: int
    price: float        # reference (last) price; limit set by caller
    reason: str         # exit | trim | enter | add
    est_value: float = 0.0

    def __post_init__(self):
        self.est_value = round(self.qty * self.price, 2)


@dataclass
class Plan:
    orders: list[Order] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    nav: float = 0.0
    cash: float = 0.0
    turnover_pct: float = 0.0

    @property
    def sells(self):
        return [o for o in self.orders if o.side == "sell"]

    @property
    def buys(self):
        return [o for o in self.orders if o.side == "buy"]


def compute_plan(targets: dict[str, float],
                 held: dict[str, float],
                 sellable: dict[str, float],
                 prices: dict[str, float],
                 cash: float,
                 *,
                 min_order_usd: float = 50.0,
                 min_order_bps: float = 25.0,
                 max_order_usd: float = 15000.0,
                 max_turnover_pct: float = 40.0,
                 cost_buffer: float = 0.005) -> Plan:
    """targets: {ticker: weight 0..1}; held/sellable: {ticker: shares};
    prices: {ticker: last}; cash: USD available.

    max_order_usd clips a single order (remainder handled next run).
    max_turnover_pct caps total |order value| as % of NAV — exits are exempt
    (they must happen), trims/buys get dropped smallest-first to fit.
    cost_buffer shaves buy budget for fees + limit-price slippage.
    """
    plan = Plan(cash=cash)
    nav = cash + sum(sh * prices[t] for t, sh in held.items() if t in prices)
    plan.nav = nav
    if nav <= 0:
        plan.warnings.append("account NAV <= 0; nothing to do")
        return plan
    for t in held:
        if t not in prices:
            plan.warnings.append(f"{t}: held but no price — excluded from NAV and untouched")

    threshold = max(min_order_usd, nav * min_order_bps / 10_000)
    exits: list[Order] = []
    trims: list[Order] = []
    buys: list[Order] = []

    def clip(qty: int, price: float) -> int:
        return min(qty, max(1, math.floor(max_order_usd / price))) if price > 0 else 0

    # exits: held but no longer targeted
    for t, sh in held.items():
        if t in targets or t not in prices:
            continue
        qty = int(min(sh, sellable.get(t, sh)))
        if qty > 0:
            exits.append(Order("sell", t, clip(qty, prices[t]), prices[t], "exit"))

    # rebalances and entries
    for t, w in sorted(targets.items()):
        px = prices.get(t)
        if not px or px <= 0:
            plan.warnings.append(f"{t}: no price — skipped")
            continue
        tgt_sh = math.floor(w * nav / px)
        cur_sh = int(held.get(t, 0))
        delta = tgt_sh - cur_sh
        if tgt_sh == 0 and cur_sh == 0:
            plan.warnings.append(f"{t}: weight {w:.2%} can't afford 1 share @ {px:.2f}")
            continue
        if delta == 0:
            continue
        value = abs(delta) * px
        if value < threshold:
            continue
        if delta < 0:
            qty = int(min(-delta, sellable.get(t, cur_sh)))
            if qty > 0:
                trims.append(Order("sell", t, clip(qty, px), px, "trim"))
        else:
            reason = "enter" if cur_sh == 0 else "add"
            buys.append(Order("buy", t, clip(delta, px), px, reason))

    # turnover cap: exits exempt; drop smallest trims/buys until under cap
    cap = nav * max_turnover_pct / 100
    exit_value = sum(o.est_value for o in exits)
    if exit_value > cap:
        plan.warnings.append(
            f"exits alone (${exit_value:,.0f}) exceed turnover cap (${cap:,.0f}) — "
            f"executing exits anyway (in/out mirroring takes priority)")
    room = max(0.0, cap - exit_value)
    kept_trims, kept_buys = [], []
    for o in sorted(trims, key=lambda o: -o.est_value):
        if o.est_value <= room:
            kept_trims.append(o)
            room -= o.est_value
        else:
            plan.warnings.append(f"{o.ticker}: trim ${o.est_value:,.0f} dropped (turnover cap)")
    for o in sorted(buys, key=lambda o: -o.est_value):
        if o.est_value <= room:
            kept_buys.append(o)
            room -= o.est_value
        else:
            plan.warnings.append(f"{o.ticker}: buy ${o.est_value:,.0f} dropped (turnover cap)")

    # cash cap on buys: cash now + expected sell proceeds, minus cost buffer
    sells = sorted(exits + kept_trims, key=lambda o: -o.est_value)
    budget = (cash + sum(o.est_value for o in sells)) * (1 - cost_buffer)
    final_buys = []
    for o in sorted(kept_buys, key=lambda o: -o.est_value):
        if o.est_value <= budget:
            final_buys.append(o)
            budget -= o.est_value
        else:
            afford = math.floor(budget / o.price)
            if afford >= 1:
                final_buys.append(Order("buy", o.ticker, afford, o.price, o.reason))
                budget -= afford * o.price
            else:
                plan.warnings.append(f"{o.ticker}: buy dropped (insufficient cash)")

    plan.orders = sells + final_buys
    total = sum(o.est_value for o in plan.orders)
    plan.turnover_pct = round(100 * total / nav, 2) if nav else 0.0
    return plan
