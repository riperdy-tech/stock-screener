import yfinance as yf
import argparse
import json
import sys
import numpy as np

def safe_get(df, row_name, col_idx):
    try:
        if row_name in df.index:
            val = df.loc[row_name].iloc[col_idx]
            if np.isnan(val) or np.isinf(val):
                return None
            return float(val)
    except:
        pass
    return None

def fetch_data(ticker_symbol):
    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info
        
        income_stmt = ticker.income_stmt
        q_income_stmt = ticker.quarterly_income_stmt
        cash_flow = ticker.cash_flow
        balance_sheet = ticker.balance_sheet
        
        # We need last 2 annual and last 4 quarterly
        
        # Helper to extract metrics
        def extract_metrics(df, cols_to_extract):
            if df is None or df.empty:
                return []
            res = []
            num_cols = min(cols_to_extract, len(df.columns))
            for i in range(num_cols):
                date_str = str(df.columns[i])[:10]
                res.append({
                    "Date": date_str,
                    "TotalRevenue": safe_get(df, "Total Revenue", i),
                    "GrossProfit": safe_get(df, "Gross Profit", i),
                    "OperatingIncome": safe_get(df, "Operating Income", i) or safe_get(df, "EBIT", i),
                    "NetIncome": safe_get(df, "Net Income", i)
                })
            return res
            
        annual_financials = extract_metrics(income_stmt, 2)
        quarterly_financials = extract_metrics(q_income_stmt, 4)
        
        # Cash Flow & Balance Sheet recent metrics
        operating_cash_flow = safe_get(cash_flow, "Operating Cash Flow", 0) if (cash_flow is not None and not cash_flow.empty) else None
        capex = safe_get(cash_flow, "Capital Expenditure", 0) if (cash_flow is not None and not cash_flow.empty) else None
        fcf = safe_get(cash_flow, "Free Cash Flow", 0) if (cash_flow is not None and not cash_flow.empty) else None
        if fcf is None and operating_cash_flow is not None and capex is not None:
             fcf = operating_cash_flow + capex # Capex is usually negative in yfinance
             
        sbc = safe_get(cash_flow, "Stock Based Compensation", 0) if (cash_flow is not None and not cash_flow.empty) else None
        
        total_cash = safe_get(balance_sheet, "Cash And Cash Equivalents", 0) if (balance_sheet is not None and not balance_sheet.empty) else None
        if total_cash is None:
             total_cash = info.get("totalCash", 0)
             
        total_debt = safe_get(balance_sheet, "Total Debt", 0) if (balance_sheet is not None and not balance_sheet.empty) else None
        if total_debt is None:
             total_debt = info.get("totalDebt", 0)
        
        shares = info.get("impliedSharesOutstanding") or info.get("sharesOutstanding") or 0
        market_cap = info.get("marketCap") or 0
        current_price = info.get("currentPrice") or info.get("previousClose") or 0
        
        # Computed metrics
        ev = market_cap
        if total_debt is not None and total_cash is not None:
             ev = market_cap + total_debt - total_cash
             
        # TTM Revenue from quarters
        ttm_revenue = None
        if len(quarterly_financials) == 4 and all(q["TotalRevenue"] is not None for q in quarterly_financials):
             ttm_revenue = sum(q["TotalRevenue"] for q in quarterly_financials)
        elif len(annual_financials) > 0:
             ttm_revenue = annual_financials[0]["TotalRevenue"]
             
        # TTM Gross Profit
        ttm_gp = None
        if len(quarterly_financials) == 4 and all(q["GrossProfit"] is not None for q in quarterly_financials):
             ttm_gp = sum(q["GrossProfit"] for q in quarterly_financials)
        elif len(annual_financials) > 0:
             ttm_gp = annual_financials[0]["GrossProfit"]
             
        # TTM EBIT
        ttm_ebit = None
        if len(quarterly_financials) == 4 and all(q["OperatingIncome"] is not None for q in quarterly_financials):
             ttm_ebit = sum(q["OperatingIncome"] for q in quarterly_financials)
        elif len(annual_financials) > 0:
             ttm_ebit = annual_financials[0]["OperatingIncome"]
        
        # Rule of 40 calc
        yoy_revenue_growth = info.get("revenueGrowth", 0) * 100 if info.get("revenueGrowth") else 0
        fcf_margin = 0
        if fcf is not None and ttm_revenue is not None and ttm_revenue > 0:
             fcf_margin = (fcf / ttm_revenue) * 100
             
        rule_of_40 = yoy_revenue_growth + fcf_margin
        
        # Valuation Multiples
        ev_sales = (ev / ttm_revenue) if (ev and ttm_revenue and ttm_revenue > 0) else None
        ev_gp = (ev / ttm_gp) if (ev and ttm_gp and ttm_gp > 0) else None
        ev_ebit = (ev / ttm_ebit) if (ev and ttm_ebit and ttm_ebit > 0) else None
        
        gross_margin_pct = (ttm_gp / ttm_revenue * 100) if (ttm_gp and ttm_revenue and ttm_revenue > 0) else None
        
        core_multiple_anchor = None
        if ev_sales is not None and ev_gp is not None:
             core_multiple_anchor = (0.4 * ev_sales) + (0.4 * ev_gp)
             
        data = {
            "Ticker": ticker_symbol,
            "Price": current_price,
            "Shares_Outstanding": shares,
            "Market_Cap": market_cap,
            "Enterprise_Value_EV": ev,
            "Total_Cash": total_cash,
            "Total_Debt": total_debt,
            "SBC_Stock_Based_Comp": sbc,
            "Free_Cash_Flow_TTM": fcf,
            "Annual_Income_Statement": annual_financials,
            "Quarterly_Income_Statement": quarterly_financials,
            "Calculated_Metrics": {
                "TTM_Revenue": ttm_revenue,
                "TTM_Gross_Margin_%": gross_margin_pct,
                "YoY_Revenue_Growth_%": yoy_revenue_growth,
                "FCF_Margin_%": fcf_margin,
                "Rule_of_40": rule_of_40,
                "EV_to_Sales": ev_sales,
                "EV_to_Gross_Profit": ev_gp,
                "EV_to_EBIT": ev_ebit,
                "Core_Anchor_Multiple_0.4Sales_0.4GP": core_multiple_anchor
            }
        }
        
        # Clean up any residual NaNs
        def clean_dict(d):
            if isinstance(d, dict):
                return {str(k): clean_dict(v) for k, v in d.items()}
            elif isinstance(d, list):
                return [clean_dict(v) for v in d]
            elif isinstance(d, float):
                if np.isnan(d) or np.isinf(d):
                    return None
            return d
            
        print(json.dumps(clean_dict(data)))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", required=True, help="Stock ticker symbol")
    args = parser.parse_args()
    fetch_data(args.ticker)
