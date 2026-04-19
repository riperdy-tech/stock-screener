import nsepython as nse
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

def fetch_india_data(symbol):
    try:
        # Quote data for Price
        price_data = nse.nsefetch(f'https://www.nseindia.com/api/quote-equity?symbol={symbol}')
        price = price_data.get('priceInfo', {}).get('lastPrice', 0)
        issued_size = float(price_data.get('securityInfo', {}).get('issuedSize', 0))
        mcap = price * issued_size
        
        # Deep financials from Screener.in (Consolidated)
        url = f"https://www.screener.in/company/{symbol}/consolidated/"
        dfs = pd.read_html(url)
        
        # Table indices: 0: Quarterly, 1: Annual, 6: Balance Sheet, 7: Cash Flow
        q_df = dfs[0].set_index(dfs[0].columns[0])
        a_df = dfs[1].set_index(dfs[1].columns[0])
        bs_df = dfs[6].set_index(dfs[6].columns[0])
        cf_df = dfs[7].set_index(dfs[7].columns[0])
        
        def clean_val(v):
            if isinstance(v, str):
                v = v.replace(',', '').replace('%', '').replace('+', '').replace('\xa0', '')
            try: return float(v)
            except: return 0.0

        def get_val_safe(df, row_prefix, col):
            for idx in df.index:
                if str(idx).replace(" ", "").lower().startswith(str(row_prefix).replace(" ", "").lower()):
                    if col in df.columns:
                        return clean_val(df.loc[idx, col])
            return None

        def get_val_with_fallbacks(df, prefixes, col):
            for p in prefixes:
                val = get_val_safe(df, p, col)
                if val is not None and val != 0:
                    return val
            return None

        # Reported columns only
        q_cols = [c for c in q_df.columns if is_reported(c)][-4:]
        a_cols = [c for c in a_df.columns if is_reported(c)]
        if "TTM" in a_cols: a_cols.remove("TTM")
        a_cols = a_cols[-2:]

        # Cash & Debt (from Balance Sheet table - last available reported column)
        bs_cols = [c for c in bs_df.columns if is_reported(c)]
        last_bs_col = bs_cols[-1]
        raw_debt = get_val_safe(bs_df, 'Borrowings', last_bs_col)
        total_debt = raw_debt * 10000000 if raw_debt else 0
        total_cash = 0 # No reliable summary proxy for India cash

        # Cash Flow (from CF table - last available reported column)
        cf_cols = [c for c in cf_df.columns if is_reported(c)]
        last_cf_col = cf_cols[-1]
        raw_ocf = get_val_safe(cf_df, 'Cash from Operating Activity', last_cf_col)
        raw_fcf = get_val_safe(cf_df, 'Free Cash Flow', last_cf_col)
        
        ocf = raw_ocf * 10000000 if raw_ocf else 0
        fcf_val = raw_fcf * 10000000 if raw_fcf else 0
        capex = ocf - fcf_val if (ocf is not None and fcf_val is not None) else 0

        quarters = []
        for col in q_cols:
            tr = get_val_with_fallbacks(q_df, ["Sales", "Revenue", "Interest Earned", "Total Income"], col)
            oi = get_val_with_fallbacks(q_df, ["Operating Profit", "Financing Profit", "Profit before tax"], col)
            ni = get_val_safe(q_df, 'Net Profit', col)
            quarters.append({
                "Date": col,
                "TotalRevenue": tr * 10000000 if tr else None,
                "GrossProfit": None,
                "OperatingIncome": oi * 10000000 if oi else None,
                "NetIncome": ni * 10000000 if ni else None
            })
            
        annuals = []
        for col in a_cols:
            tr = get_val_with_fallbacks(a_df, ["Sales", "Revenue", "Interest Earned", "Total Income"], col)
            oi = get_val_with_fallbacks(a_df, ["Operating Profit", "Financing Profit", "Profit before tax"], col)
            ni = get_val_safe(a_df, 'Net Profit', col)
            annuals.append({
                "Date": col,
                "TotalRevenue": tr * 10000000 if tr else None,
                "GrossProfit": None,
                "OperatingIncome": oi * 10000000 if oi else None,
                "NetIncome": ni * 10000000 if ni else None
            })
            
        ttm_rev = sum(q['TotalRevenue'] for q in quarters if q['TotalRevenue']) if quarters else 0
        ttm_gp = None
        ttm_ebit = sum(q['OperatingIncome'] for q in quarters if q['OperatingIncome']) if quarters else 0
        
        # YoY Growth
        growth = 0
        if len(quarters) >= 4 and quarters[0]['TotalRevenue']:
             growth = (quarters[-1]['TotalRevenue'] - quarters[0]['TotalRevenue']) / quarters[0]['TotalRevenue'] * 100
        
        ev = mcap + total_debt - total_cash
        ev_sales = ev / ttm_rev if (ev and ttm_rev) else None
        ev_gp = ev / ttm_gp if (ev and ttm_gp) else None
        fcf_margin = (fcf_val / ttm_rev * 100) if (fcf_val and ttm_rev) else 0
        roic = (ttm_ebit / ev * 100) if (ev and ev > 0) else 0

        return {
            "Ticker": symbol,
            "Price": price,
            "Shares_Outstanding": issued_size,
            "Market_Cap": mcap,
            "Enterprise_Value_EV": ev,
            "Total_Cash": total_cash,
            "Total_Debt": total_debt,
            "SBC_Stock_Based_Comp": 0,
            "Operating_Cash_Flow": ocf,
            "Capital_Expenditure": capex,
            "Free_Cash_Flow_TTM": fcf_val,
            "Annual_Income_Statement": annuals,
            "Quarterly_Income_Statement": quarters,
            "Data_Fetched_Date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "Calculated_Metrics": {
                "TTM_Revenue": ttm_rev,
                "TTM_Gross_Profit": ttm_gp,
                "TTM_Gross_Margin_%": None,
                "YoY_Revenue_Growth_%": growth,
                "FCF_Margin_%": fcf_margin,
                "ROIC_%": roic,
                "Rule_of_40": (growth or 0) + (fcf_margin or 0),
                "EV_to_Sales": ev_sales,
                "EV_to_Gross_Profit": ev_gp,
                "EV_to_EBIT": (ev / ttm_ebit) if (ev and ttm_ebit) else None,
                "Core_Anchor_Multiple": None
            }
        }
    except Exception as e:
        return {"error": f"India fetch failed: {str(e)}"}

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
    if ticker.endswith('.NS'):
        res = fetch_india_data(ticker.replace('.NS', ''))
    elif ticker.endswith('.KS') or ticker.endswith('.KQ'):
        res = fetch_korea_data(ticker.split('.')[0])
    else:
        if ticker.isdigit() and len(ticker) == 6:
            res = fetch_korea_data(ticker)
        else:
            res = fetch_india_data(ticker)
            
    print(json.dumps(clean_data(res)))
