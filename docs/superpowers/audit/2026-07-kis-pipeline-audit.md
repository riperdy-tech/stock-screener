# KIS Pipeline Audit — Phase 1 Report

**Date started:** 2026-07-20 · **Auditor:** Claude (read-only engagement per spec 2026-07-20)
**Spec:** docs/superpowers/specs/2026-07-20-kis-pipeline-audit-design.md

## 0. Executive summary
(written last — Task 8)

## Findings register
| ID | Sev | Link | Title | Evidence |
|----|-----|------|-------|----------|

## 1. Link 1 — RS2 verdict generation

## 2. Link 2 — Overlay → factor guardrail

## 3. Link 3 — Ledger mechanics & churn forensics

## 4. Link 4 — Reconcile & execution

## 5. Link 5 — Risk & philosophy coherence

## 6. Attribution verdict

## 7. Assumptions & open questions for the user

## 8. Method & environment

- **Environment:** Windows 11, Python 3.12.10 (system `python`), git @ `e211748487` (audit start). All forensic tools in `tools/`, stdlib-only, read-only; outputs in `tools/out/` (gitignored).
- **Ledger schema (observed via `tools/inspect_ledgers.py`):**
  - `ledgers.{name}.closed[]`: `ticker, entry_date, entry_price, exit_date, exit_price, hold_days, return_pct, post_exit_days(=30), post_exit_return_pct` — the tracker already records 30-day post-exit forward returns.
  - `ledgers.{name}.trades[]`: `date, side, ticker, price, value, reason` (value in NAV points; reasons like `entered_rank`).
  - `ledgers.{name}.state`: `cash, holdings{}, units`; plus `nav_series[]` with per-day `nav` and `benches{IWM,SPY,QQQ,SOXX,DRAM}`.
- **Plan deviation log:** forensic scripts use `ROOT = parents[4]` (the plan's `parents[3]` was one level short — mechanical fix, no scope change).
- **Data window caveat:** ledger inception 2026-06-12 → 2026-07-19 (~26 trading days). Mechanical decomposition is meaningful; statistical claims about signal quality are not.
