import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVERSE_SCORES_JSON = ROOT / "public" / "data" / "reverse_scores.json"


def load_scores(path):
    with path.open("r", encoding="utf-8") as f:
        scores = json.load(f)
    if not isinstance(scores, dict):
        raise RuntimeError(f"Expected {path} to contain an object keyed by ticker.")
    return scores


def fmt(value, width, decimals=None):
    if value is None:
        text = "-"
    elif isinstance(value, (int, float)) and decimals is not None:
        text = f"{value:.{decimals}f}"
    else:
        text = str(value)
    if len(text) > width:
        text = text[: width - 1] + "…"
    return text.ljust(width)


def main():
    parser = argparse.ArgumentParser(description="Print the reverse-engine leaderboard.")
    parser.add_argument("-n", "--limit", type=int, default=30, help="number of rows to print")
    parser.add_argument(
        "--band",
        choices=["High", "Solid", "Watchlist", "Monitor", "Reject-tier"],
        help="optional band filter",
    )
    parser.add_argument("--archetype", choices=list("ABCDEFGHI"), help="optional archetype filter")
    args = parser.parse_args()

    rows = []
    for ticker, reverse in load_scores(REVERSE_SCORES_JSON).items():
        if not isinstance(reverse, dict):
            continue
        composite = reverse.get("rev_composite")
        if composite is None:
            continue
        if args.band and reverse.get("rev_band") != args.band:
            continue
        if args.archetype and reverse.get("rev_archetype") != args.archetype:
            continue
        rows.append((ticker, reverse))

    rows.sort(key=lambda item: (-float(item[1]["rev_composite"]), item[0]))

    headers = [
        ("Rank", 6),
        ("Ticker", 8),
        ("Arch", 6),
        ("Quality", 9),
        ("MoS", 8),
        ("DQ", 4),
        ("Band", 12),
        ("Composite", 10),
    ]
    print("".join(label.ljust(width) for label, width in headers))
    print("".join("-" * width for _, width in headers))

    for ticker, reverse in rows[: args.limit]:
        print(
            fmt(reverse.get("rev_rank"), 6)
            + fmt(ticker, 8)
            + fmt(reverse.get("rev_archetype"), 6)
            + fmt(reverse.get("rev_quality"), 9, 2)
            + fmt(reverse.get("rev_mos"), 8, 2)
            + fmt(reverse.get("rev_data_quality"), 4)
            + fmt(reverse.get("rev_band"), 12)
            + fmt(reverse.get("rev_composite"), 10, 2)
        )

    print(f"\nPrinted {min(args.limit, len(rows))} of {len(rows)} ranked reverse-engine rows.")


if __name__ == "__main__":
    main()
