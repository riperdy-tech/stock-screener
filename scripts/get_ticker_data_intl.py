import FinanceDataReader as fdr
import argparse
import json
import sys
import numpy as np
import pandas as pd
from datetime import datetime

def safe_float(val, default=None):
    try:
        if val is None or pd.isna(val): return default
        return float(val)
    except:
        return default

def is_reported(col_str):
    if not isinstance(col_str, str): return True
    if "(E)" in col_str or "(P)" in col_str or "(Estimated)" in col_str or "Est" in col_str:
        return False
    # Check for future years (heuristic)
    import re
    years = re.findall(r'\d{4}', col_str)
    if years:
        year = int(years[0])
        if year > datetime.now().year + 1: # Allow current year
            return False
    return True



def fetch_korea_data(segment_symbol):
    try:
        # Korea StockListing for base info
        df_list = fdr.StockListing('KRX')
        row = df_list[df_list['Code'] == segment_symbol]
        if row.empty: return {"error": f"Ticker {segment_symbol} not found in KRX listing"}
        base_row = row.iloc[0]
        
        # Deep financials from Naver Finance
        url = f"https://finance.naver.com/item/main.naver?code={segment_symbol}"
        dfs = pd.read_html(url, encoding='cp949')
        fs = None
        for df in dfs:
            if len(df) > 5 and ('매출액' in str(df.iloc[0,0]) or '영업이익' in str(df.iloc[1,0])):
                fs = df
                break
        
        annual_financials = []
        quarterly_financials = []
        
        debt_ratio = 0
        bps = 0
        if fs is not None:
            # Clean index names
            fs.columns = [c[1] if isinstance(c, tuple) else c for c in fs.columns]
            fs.set_index(fs.columns[0], inplace=True)
            
            def get_f_val(row_keyword, col_idx):
                try:
                    for i_row in range(len(fs)):
                        if row_keyword in str(fs.index[i_row]).replace(" ", ""):
                            v = fs.iloc[i_row, col_idx]
                            if pd.isna(v): return None
                            return float(v)
                    return None
                except: return None
            
            def get_f_val_with_fallbacks(keywords, col_idx):
                for k in keywords:
                    val = get_f_val(k, col_idx)
                    if val is not None and val != 0:
                        return val
                return None

            # Identify Annual vs Quarterly indices
            a_indices = []
            q_indices = []
            
            for i, col in enumerate(fs.columns):
                if not is_reported(col): continue
                if i < 4:
                    a_indices.append(i)
                else:
                    q_indices.append(i)
            
            # Select last 2 annual and last 4 quarterly indices
            a_indices = a_indices[-2:]
            q_indices = q_indices[-4:]

            for idx_col in a_indices:
                col_name = fs.columns[idx_col]
                date_str = str(col_name[1]) if isinstance(col_name, tuple) else str(col_name)
                tr = get_f_val_with_fallbacks(['매출액', '영업수익', '영업수익'], idx_col)
                oi = get_f_val('영업이익', idx_col)
                ni = get_f_val('당기순이익', idx_col)
                annual_financials.append({
                    "Date": date_str,
                    "TotalRevenue": tr * 100000000 if tr else None,
                    "GrossProfit": None,
                    "OperatingIncome": oi * 100000000 if oi else None,
                    "NetIncome": ni * 100000000 if ni else None
                })
                
            for idx_col in q_indices:
                col_name = fs.columns[idx_col]
                date_str = str(col_name[1]) if isinstance(col_name, tuple) else str(col_name)
                tr = get_f_val_with_fallbacks(['매출액', '영업수익'], idx_col)
                oi = get_f_val('영업이익', idx_col)
                ni = get_f_val('당기순이익', idx_col)
                quarterly_financials.append({
                    "Date": date_str,
                    "TotalRevenue": tr * 100000000 if tr else None,
                    "GrossProfit": None,
                    "OperatingIncome": oi * 100000000 if oi else None,
                    "NetIncome": ni * 100000000 if ni else None
                })
            
            last_idx = q_indices[-1] if q_indices else 0
            debt_ratio = get_f_val('부채비율', last_idx)
            bps = get_f_val('BPS', last_idx)

        mcap = safe_float(base_row.get('Marcap'), 0)
        shares = safe_float(base_row.get('Stocks'), 0)
        equity = (bps * shares) if (bps and shares) else 0
        total_debt = equity * (debt_ratio / 100) if (equity and debt_ratio) else 0
        total_cash = 0 # No proxy
        ev = (mcap + total_debt - total_cash) if (mcap is not None) else 0
        
        ttm_rev = sum(q['TotalRevenue'] for q in quarterly_financials if (q['TotalRevenue'] and q['TotalRevenue'] > 0)) if quarterly_financials else 0
        ttm_gp = None
        ttm_ebit = sum(q['OperatingIncome'] for q in quarterly_financials if (q['OperatingIncome'] and q['OperatingIncome'] > 0)) if quarterly_financials else 0
        
        growth = 0
        if len(quarterly_financials) >= 4 and quarterly_financials[0].get('TotalRevenue'):
             q0_rev = quarterly_financials[0]['TotalRevenue']
             ql_rev = quarterly_financials[-1]['TotalRevenue']
             if q0_rev and ql_rev:
                 growth = (ql_rev - q0_rev) / q0_rev * 100
             
        ev_sales = ev / ttm_rev if (ev and ttm_rev) else None
        ev_gp = ev / ttm_gp if (ev and ttm_gp) else None
        roic = (ttm_ebit / ev * 100) if (ev and ev > 0) else 0

        return {
            "Ticker": segment_symbol,
            "Price": safe_float(base_row.get('Close'), 0),
            "Shares_Outstanding": shares,
            "Market_Cap": mcap,
            "Enterprise_Value_EV": ev,
            "Total_Cash": total_cash,
            "Total_Debt": total_debt,
            "SBC_Stock_Based_Comp": 0,
            "Operating_Cash_Flow": None,
            "Capital_Expenditure": None,
            "Free_Cash_Flow_TTM": None,
            "Annual_Income_Statement": annual_financials,
            "Quarterly_Income_Statement": quarterly_financials,
            "Data_Fetched_Date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "Calculated_Metrics": {
                "TTM_Revenue": ttm_rev,
                "TTM_Gross_Profit": ttm_gp,
                "TTM_Gross_Margin_%": None,
                "YoY_Revenue_Growth_%": growth,
                "FCF_Margin_%": None,
                "ROIC_%": roic,
                "Rule_of_40": growth,
                "EV_to_Sales": ev_sales,
                "EV_to_Gross_Profit": ev_gp,
                "EV_to_EBIT": (ev / ttm_ebit) if (ev and ttm_ebit) else None,
                "Core_Anchor_Multiple": None
            }
        }
    except Exception as e:
        return {"error": f"Korea fetch failed: {str(e)}"}

def fetch_taiwan_data(symbol):
    try:
        import yfinance as yf
        stock = yf.Ticker(symbol)
        info = stock.info
        
        mcap = safe_float(info.get('marketCap'), 0)
        price = safe_float(info.get('currentPrice', info.get('previousClose')), 0)
        shares = info.get('impliedSharesOutstanding') or info.get('sharesOutstanding') or 0

        # VENDOR IDENTITY GUARD (2026-08-14) — same rule as fetch_data.py: publish
        # price*shares when Yahoo's marketCap disagrees with its own payload by >2%.
        mcap_vendor = None
        if price and shares and mcap:
            _implied = price * shares
            if _implied > 0 and abs(mcap / _implied - 1) > 0.02:
                mcap_vendor = mcap
                mcap = _implied

        income_stmt = stock.income_stmt
        q_income_stmt = stock.quarterly_income_stmt
        cash_flow_stmt = stock.cashflow
        bs = stock.balance_sheet

        # FX-AWARE INGESTION (2026-08-14): .TW names quote AND report in TWD, so the
        # proven conversion table never applies here — this call is the mismatch
        # DETECTOR (fx_normalize flags any statement/quote currency split instead of
        # letting it pass silently). Same-currency names return untouched.
        import fx_normalize
        info, income_stmt, q_income_stmt, cash_flow_stmt, bs, fx_meta = \
            fx_normalize.normalize(symbol, info, income_stmt, q_income_stmt,
                                   cash_flow_stmt, bs)

        def safe_get_df(df, row_name, col_idx):
            try:
                if df is not None and not df.empty and row_name in df.index:
                    val = df.loc[row_name].iloc[col_idx]
                    if isinstance(val, (int, float)) and not np.isnan(val): return float(val)
            except: pass
            return None

        def extract_income(df, num):
            if df is None or df.empty: return []
            res = []
            for i in range(min(num, len(df.columns))):
                res.append({
                    "Date": str(df.columns[i])[:10],
                    "TotalRevenue": safe_get_df(df, "Total Revenue", i),
                    "GrossProfit": safe_get_df(df, "Gross Profit", i),
                    "OperatingIncome": safe_get_df(df, "Operating Income", i) or safe_get_df(df, "EBIT", i),
                    "NetIncome": safe_get_df(df, "Net Income", i)
                })
            return res
            
        annuals = extract_income(income_stmt, 2)
        quarters = extract_income(q_income_stmt, 4)
        
        ocf = safe_get_df(cash_flow_stmt, "Operating Cash Flow", 0)
        capex = safe_get_df(cash_flow_stmt, "Capital Expenditure", 0)
        fcf = safe_get_df(cash_flow_stmt, "Free Cash Flow", 0)
        sbc = safe_get_df(cash_flow_stmt, "Stock Based Compensation", 0)
        if fcf is None and ocf is not None and capex is not None: fcf = ocf + capex
        
        total_cash = safe_get_df(bs, "Cash And Cash Equivalents", 0) or safe_float(info.get("totalCash"), 0)
        total_debt = safe_get_df(bs, "Total Debt", 0) or safe_float(info.get("totalDebt"), 0)
        
        ev = mcap
        if total_debt is not None and total_cash is not None:
            ev = mcap + total_debt - total_cash
            
        ttm_rev = sum(q["TotalRevenue"] for q in quarters) if (len(quarters) == 4 and all(q.get("TotalRevenue") is not None for q in quarters)) else (annuals[0].get("TotalRevenue", 0) if annuals else 0)
        ttm_gp = sum(q["GrossProfit"] for q in quarters) if (len(quarters) == 4 and all(q.get("GrossProfit") is not None for q in quarters)) else (annuals[0].get("GrossProfit", None) if annuals else None)
        ttm_ebit = sum(q["OperatingIncome"] for q in quarters) if (len(quarters) == 4 and all(q.get("OperatingIncome") is not None for q in quarters)) else (annuals[0].get("OperatingIncome", None) if annuals else None)
        
        growth = safe_float(info.get("revenueGrowth"), 0) * 100
        fcf_margin = (fcf / ttm_rev * 100) if (fcf and ttm_rev and ttm_rev > 0) else 0
        roic = (ttm_ebit / ev * 100) if (ttm_ebit and ev and ev > 0) else 0

        out = {
            "Ticker": symbol,
            "Price": price,
            "Shares_Outstanding": shares,
            "Market_Cap": mcap,
            "Market_Cap_vendor": mcap_vendor,
            "Enterprise_Value_EV": ev,
            "Total_Cash": total_cash,
            "Total_Debt": total_debt,
            "SBC_Stock_Based_Comp": sbc,
            "Operating_Cash_Flow": ocf,
            "Capital_Expenditure": capex,
            "Free_Cash_Flow_TTM": fcf,
            "Annual_Income_Statement": annuals,
            "Quarterly_Income_Statement": quarters,
            "Data_Fetched_Date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "Calculated_Metrics": {
                "TTM_Revenue": ttm_rev,
                "TTM_Gross_Profit": ttm_gp,
                "TTM_Gross_Margin_%": (ttm_gp / ttm_rev * 100) if (ttm_gp and ttm_rev and ttm_rev > 0) else None,
                "YoY_Revenue_Growth_%": growth,
                "FCF_Margin_%": fcf_margin,
                "ROIC_%": roic,
                "Rule_of_40": growth + fcf_margin,
                "EV_to_Sales": (ev / ttm_rev) if (ev and ttm_rev and ttm_rev > 0) else None,
                "EV_to_Gross_Profit": (ev / ttm_gp) if (ev and ttm_gp and ttm_gp > 0) else None,
                "EV_to_EBIT": (ev / ttm_ebit) if (ev and ttm_ebit and ttm_ebit > 0) else None,
                "Core_Anchor_Multiple": None
            }
        }
        if fx_meta:
            out["FX"] = fx_meta
        return out
    except Exception as e:
        return {"error": f"Taiwan fetch failed: {str(e)}"}

def clean_data(d):
    if isinstance(d, dict): return {k: clean_data(v) for k, v in d.items()}
    if isinstance(d, list): return [clean_data(v) for v in d]
    if isinstance(d, float) and (np.isnan(d) or np.isinf(d)): return None
    return d

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", required=True)
    args = parser.parse_args()
    
    ticker = args.ticker.upper()
    if ticker.endswith('.KS') or ticker.endswith('.KQ'):
        res = fetch_korea_data(ticker.split('.')[0])
    elif ticker.endswith('.TW') or ticker.endswith('.TWO'):
        res = fetch_taiwan_data(ticker)
    else:
        if ticker.isdigit() and len(ticker) == 6:
            res = fetch_korea_data(ticker)
        else:
            res = {"error": "Unknown ticker format"}
            
    print(json.dumps(clean_data(res)))

