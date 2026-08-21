import nsepython as nse
import yfinance as yf
import pandas as pd

def test_india():
    print("\nTesting India (NSE)...")
    try:
        # Try getting indices
        indices = nse.nse_get_index_list()
        print(f"Available indices: {indices[:5]}...")
        
        # Try getting NIFTY 500 stocks
        # Some versions use nse_get_index_stocks, others nsefetch
        print("Trying to fetch NIFTY 500 stocks...")
        # Payload for all stocks might be huge, let's try a common index first
        payload = nse.nsefetch('https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050')
        if payload and 'data' in payload:
            stocks = payload['data']
            print(f"Found {len(stocks)} stocks in NIFTY 50 via nsefetch.")
            symbol = stocks[0]['symbol']
            yf_ticker = symbol + ".NS"
            print(f"Fetching data for {yf_ticker}...")
            stock = yf.Ticker(yf_ticker)
            print(f"Price: {stock.info.get('currentPrice')}")
        else:
            print("nsefetch failed to return data.")
            
    except Exception as e:
        print(f"India test failed: {e}")

if __name__ == "__main__":
    test_india()
