"""hygiene_thresholds.py — Shared retail hygiene thresholds for Tier 1 and SCR-03b (P3.6)."""

MIN_MARKET_CAP: float = 300_000_000.0   # $300M
MIN_SHARE_PRICE: float = 3.00           # $3.00
MIN_ADV_DOLLAR: float = 300_000.0       # $300k/day

# P3.6b: forensic/solvency evidence (Beneish sales-growth bias, single-year FCF/op-loss
# leverage) is mostly built on small caps. At or above this market cap, those checks are a
# flag in front of the analyst instead of a silent veto — see PHASE_3_QUANT_BOOK.md P3.6b.
LARGE_CAP_FLAG_ONLY_USD: float = 10_000_000_000.0   # $10B
