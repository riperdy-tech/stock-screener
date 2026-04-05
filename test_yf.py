import yfinance as yf
ticker = yf.Ticker("AAPL")
print("Quarterly Income Stmt shape:", ticker.get_income_stmt(freq="quarterly").shape)
print("Quarterly Balance Sheet shape:", ticker.get_balance_sheet(freq="quarterly").shape)
print("Insider purchases:", type(ticker.insider_purchases), len(ticker.insider_purchases) if ticker.insider_purchases is not None else 0)
print("Insider transactions:", type(ticker.insider_transactions), len(ticker.insider_transactions) if ticker.insider_transactions is not None else 0)
