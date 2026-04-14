"""
Ultra-fast batch price fetcher.
Usage: python get_prices.py TICKER1 TICKER2 TICKER3 ...
Output: JSON object { "TICKER": price, ... }
Uses yfinance download() which batches all tickers in a single HTTP request.
"""
import sys
import json
import yfinance as yf

def main():
    tickers = sys.argv[1:]
    if not tickers:
        print("{}")
        return

    try:
        # Single batched request - much faster than individual Ticker() calls
        data = yf.download(
            tickers,
            period="1d",
            interval="1m",
            progress=False,
            auto_adjust=True,
            group_by="ticker" if len(tickers) > 1 else None
        )

        prices = {}

        if len(tickers) == 1:
            # Single ticker: data is a simple DataFrame
            ticker = tickers[0]
            if data is not None and not data.empty and "Close" in data.columns:
                price = float(data["Close"].dropna().iloc[-1])
                prices[ticker] = round(price, 2)
        else:
            # Multiple tickers: data is MultiIndex (ticker, field)
            for ticker in tickers:
                try:
                    close_col = data[ticker]["Close"] if ticker in data.columns.get_level_values(0) else None
                    if close_col is not None and not close_col.dropna().empty:
                        prices[ticker] = round(float(close_col.dropna().iloc[-1]), 2)
                except Exception:
                    pass

        print(json.dumps(prices))

    except Exception as e:
        # Fail silently — return empty so UI just keeps old prices
        sys.stderr.write(f"Price fetch error: {e}\n")
        print("{}")

if __name__ == "__main__":
    main()
