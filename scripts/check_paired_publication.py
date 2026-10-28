"""Fail-closed public stocks/Reverse contract before EACH writer commits/pushes.

Score_reverse writes the same per-symbol Reverse JSON in stocks.json and
reverse_scores.json; any partial or mixed-version pair must never be pushed.
No filesystem mutations, networking or model calls.
"""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "public" / "data"


def _strict_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError(f"duplicate JSON key: {key}")
        obj[key] = value
    return obj


def _invalid_number(value):
    raise ValueError(f"non-finite JSON number: {value}")


def _load(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f, object_pairs_hook=_strict_object,
                         parse_constant=_invalid_number)


def validate(stocks, reverse):
    """Return counts, or raise ValueError on any incomplete/mixed pair."""
    if not isinstance(stocks, list) or not stocks:
        raise ValueError("stocks.json must be a nonempty list")
    if not isinstance(reverse, dict) or not reverse:
        raise ValueError("reverse_scores.json must be a nonempty object")
    seen = set()
    for stock in stocks:
        if not isinstance(stock, dict):
            raise ValueError("stocks.json contains non-object entry")
        symbol = stock.get("symbol")
        if not isinstance(symbol, str) or not symbol.strip() or symbol in seen:
            raise ValueError(f"missing or duplicate stock symbol: {symbol!r}")
        seen.add(symbol)
        if symbol not in reverse:
            raise ValueError(f"missing external Reverse record for {symbol}")
        embedded, external = stock.get("reverse"), reverse[symbol]
        if not isinstance(embedded, dict) or not embedded:
            raise ValueError(f"missing embedded Reverse record for {symbol}")
        if not isinstance(external, dict) or not external:
            raise ValueError(f"empty external Reverse record for {symbol}")
        if embedded != external:
            raise ValueError(f"mixed-version Reverse fields for {symbol}")
    extras = reverse.keys() - seen
    if extras:
        raise ValueError(f"{len(extras)} Reverse symbols absent from stocks.json")
    return {"stocks": len(stocks), "reverse": len(reverse), "exact_pairs": len(seen)}


def main():
    try:
        result = validate(_load(DATA / "stocks.json"),
                          _load(DATA / "reverse_scores.json"))
    except (OSError, ValueError, TypeError) as exc:
        print(f"FATAL: refuse mixed/partial stocks + Reverse publish: {exc}",
              file=sys.stderr)
        return 1
    print(f"PASS paired publication: {result['exact_pairs']} exact stock/Reverse records")
    return 0


if __name__ == "__main__":
    sys.exit(main())
