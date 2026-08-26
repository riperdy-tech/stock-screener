"""Conviction extraction from the depth analysis write-ups.

The band_direction_v1 depth verdict (depth_overlay.json) has no numeric conviction
field — it is prose in the per-ticker report bundle (depth_reports/{TICKER}.json),
in the SECTION 5 / "CONVICTION & POSITION SIZING" block, on an /15 scale. Both arms
share the RS2 framework (local Ollama Qwen and cloud DeepSeek), so the format is the
same across the whole book.

This module parses the headline conviction score from a sample's report text and
aggregates the (typically 3) samples into a per-ticker mean. It is the ONLY thing
downstream that needs the number — score_factors.apply_llm_overlay uses it for the
low-quality-overvalued veto (direction == overvalued AND conviction < CONV_VETO).

Format variants handled (measured across all 169 live bundles, 94% of samples):
  - inline           'conviction: 9/15'   /  'CONVICTION = 11/15'
  - split-quality    'HIGH on business quality (12/15)'  -> 12 (the /15 number)
  - label form       'Conviction Score (/15): 9'         ('/15' in the label)
Rejected: adjustment steps ('-0.5'), percents ('5.6%'), out-of-range values.

No network, no imports beyond the stdlib. Pure functions for testability.
"""

import json
import re
from pathlib import Path

# 'conviction ... N/15' — the number adjacent to a /15, on a conviction mention.
_INLINE = re.compile(r"conviction[^\n]{0,40}?(\d{1,2}(?:\.\d)?)\s*/\s*15", re.I)
# 'Conviction Score (/15): N' — the /15 sits in the label, the number follows.
_LABEL = re.compile(
    r"conviction[^\n]{0,20}\(\s*/\s*15\s*\)\s*[:=]?\s*\**\s*(\d{1,2}(?:\.\d)?)", re.I)
# 'Conviction Score:** N' — trusted only when a /15 anchor appears in the report.
_SCORE = re.compile(r"conviction\s+score[^\n0-9]{0,15}(\d{1,2}(?:\.\d)?)", re.I)


def _in_range(v):
    return v is not None and 0 <= v <= 15


def parse_conviction(report):
    """The headline /15 conviction from one sample's report text, or None.

    Prefers the inline and label forms (both /15-anchored); falls back to a bare
    'Conviction Score: N' only when the report uses a /15 scale somewhere, so a
    stray number is never mistaken for a score.
    """
    if not report:
        return None
    for rx in (_INLINE, _LABEL):
        m = rx.search(report)
        if m:
            v = float(m.group(1))
            if _in_range(v):
                return v
    if re.search(r"/\s*15", report):
        m = _SCORE.search(report)
        if m:
            v = float(m.group(1))
            if _in_range(v):
                return v
    return None


def bundle_conviction(bundle):
    """(mean, n) over the parseable samples of a loaded depth_reports bundle.

    Returns (None, 0) when nothing parses. Averaging fewer than the full 3 samples
    is expected on a minority of names and is fine — the mean is over what parsed.
    """
    vals = [c for c in (parse_conviction((s or {}).get("report"))
                        for s in (bundle.get("samples") or [])) if c is not None]
    return (round(sum(vals) / len(vals), 2), len(vals)) if vals else (None, 0)


def load_conviction_map(reports_dir, tickers):
    """{ticker: mean_conviction} for the given tickers, reading each bundle once.

    Missing bundles / unparseable reports are simply absent from the map (the caller
    treats absence as 'no conviction', which never fabricates a veto).
    """
    reports_dir = Path(reports_dir)
    out = {}
    for t in tickers:
        f = reports_dir / f"{t}.json"
        if not f.exists():
            continue
        try:
            b = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        mean, n = bundle_conviction(b)
        if mean is not None:
            out[t] = mean
    return out
