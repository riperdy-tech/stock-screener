import yfinance as yf
import pandas as pd
import numpy as np
import time
import sys
import os
import random
import argparse
import FinanceDataReader as fdr

def get_fdr_tickers():
    print("--- FETCHING TICKER LISTS VIA FINANCE DATA READER ---")
    
    try:
        print("Fetching NASDAQ...")
        df_nasdaq = fdr.StockListing('NASDAQ')
        
        print("Fetching NYSE...")
        df_nyse = fdr.StockListing('NYSE')
        
        print("Fetching AMEX...")
        df_amex = fdr.StockListing('AMEX') 

        df_all = pd.concat([df_nasdaq, df_nyse, df_amex])
        df_all = df_all.drop_duplicates(subset=['Symbol'])
        tickers = df_all['Symbol'].tolist()
        
        clean_tickers = []
        for t in tickers:
            t_str = str(t)
            if ' ' in t_str or '-PR' in t_str or '.PR' in t_str or '-WS' in t_str or '.WS' in t_str:
                continue
            norm = t_str.replace('.', '-')
            clean_tickers.append(norm)
        
        print(f"Total Common Stock Tickers: {len(clean_tickers)}")
        return clean_tickers
    except Exception as e:
        print(f"FDR Fetch failed: {e}")
        return []

def safe_get_yoy_first_two(df, row_name):
    # Retrieve the latest and previous year values if available safely
    if row_name not in df.index:
        return None, None
    row = df.loc[row_name].dropna()
    if len(row) < 2:
        return None, None
    return row.iloc[0], row.iloc[1] # latest, previous

def safe_float(val, default_val=np.nan):
    try:
        if val is None or pd.isna(val):
            return default_val
        return float(val)
    except:
        return default_val

def get_ttm_sum(df_q, df_a, row_name):
    """
    Attempts to sum the most recent 4 quarters of `row_name` from df_q.
    If df_q lacks 4 quarters, falls back to the most recent annual value from df_a.
    """
    try:
        if row_name in df_q.index and df_q.shape[1] >= 4:
            row_q = df_q.loc[row_name].dropna()
            if len(row_q) >= 4:
                return row_q.iloc[0:4].sum()
    except Exception:
        pass
    try:
        if row_name in df_a.index:
            row_a = df_a.loc[row_name].dropna()
            if len(row_a) > 0:
                return row_a.iloc[0]
    except Exception:
        pass
    return np.nan

def main():
    parser = argparse.ArgumentParser(description="Phase 1 Stock Screener")
    parser.add_argument('--csv', type=str, help="Path to a CSV file containing tickers (must have a 'Symbol' or 'Ticker' column).")
    args = parser.parse_args()

    tickers = []
    if args.csv and os.path.exists(args.csv):
        df_input = pd.read_csv(args.csv)
        
        # --- THE "WIDE NET" INCLUSION FILTER ---
        # We explicitly ignore Phase 0 GARP rules and just filter raw data for Phase 1 inclusion
        if 'Market Cap' in df_input.columns:
            df_input = df_input[(df_input['Market Cap'] >= 50_000_000) & (df_input['Market Cap'] <= 3_000_000_000)]
        if 'Price' in df_input.columns:
            df_input = df_input[df_input['Price'] >= 1.0]
        if 'Insider Own' in df_input.columns:
            df_input = df_input[df_input['Insider Own'] >= 0.05]
            
        print(f"Filtered raw Phase 0 data down to {len(df_input)} 'Wide Net' acorns.")

        # Try to find ticker column
        for col in ['Symbol', 'Ticker', 'symbol', 'ticker']:
            if col in df_input.columns:
                tickers = df_input[col].dropna().astype(str).tolist()
                break
        if not tickers:
            print("No valid ticker column found in CSV. Using FinanceDataReader Universe.")
            tickers = get_fdr_tickers()
    else:
        tickers = get_fdr_tickers()
    
    # Just for testing, limit or take unique
    tickers = list(set(tickers))
    print(f"Starting Universe: {len(tickers)} tickers.")

    surviving_data = []

    for idx, ticker in enumerate(tickers):
        if idx > 0 and idx % 5 == 0 and len(surviving_data) > 0:
            try:
                temp_csv = 'public/data/phase1_progress.csv.tmp'
                final_csv = 'public/data/phase1_progress.csv'
                pd.DataFrame(surviving_data).to_csv(temp_csv, index=False)
                
                for _ in range(10):
                    try:
                        if os.path.exists(final_csv):
                            os.remove(final_csv)
                        os.rename(temp_csv, final_csv)
                        break
                    except OSError:
                        time.sleep(0.1 + random.random() * 0.1)
            except Exception:
                pass

        print(f"[{idx+1}/{len(tickers)}] Processing {ticker}...", end="\r")
        time.sleep(0.5) # rate limit delay
        
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            
            # 1. Sector Exclusions
            sector = info.get('sector', 'Unknown')
            industry = info.get('industry', 'Unknown')
            
            if sector in ["Financial Services", "Utilities"]:
                continue
            if industry and "Biotechnology" in industry:
                continue
                
            # Grab data statements
            bs = stock.balance_sheet
            fin = stock.financials
            cf = stock.cashflow
            q_fin = stock.quarterly_financials
            q_cf = stock.quarterly_cashflow
            
            if bs.empty or fin.empty or cf.empty:
                continue

            # 2. Negative Equity Check
            equity_row = None
            if 'Stockholders Equity' in bs.index:
                equity_row = 'Stockholders Equity'
            elif 'Total Stockholder Equity' in bs.index:
                equity_row = 'Total Stockholder Equity'
                
            if equity_row:
                equity_latest = bs.loc[equity_row].dropna().iloc[0] if len(bs.loc[equity_row].dropna()) > 0 else np.nan
                if pd.notna(equity_latest) and equity_latest <= 0:
                    continue
            else:
                # Can't evaluate clearly, we skip filtering or exclude? Let's skip filtering if missing.
                equity_latest = np.nan

            # 3. The Debt Anchor Check
            total_debt = info.get('totalDebt', 0)
            cash = info.get('totalCash', 0)
            ebitda = info.get('ebitda', 0)
            
            if ebitda is None:
                # Try financials
                if 'EBITDA' in fin.index:
                    latest_ebitda = fin.loc['EBITDA'].dropna()
                    ebitda = latest_ebitda.iloc[0] if len(latest_ebitda) > 0 else 0

            net_debt = total_debt - cash if total_debt is not None and cash is not None else 0
            if ebitda is not None and ebitda > 0:
                net_debt_to_ebitda = net_debt / ebitda
                if net_debt_to_ebitda > 3.0:
                    continue
            elif ebitda is not None and ebitda <= 0 and net_debt > 0:
                # If EBITDA is negative or zero and they have net debt, it's basically infinite > 3.0
                continue
                
            # 4. Severe Real-Time Dilution Check
            current_shares = info.get('sharesOutstanding')
            
            share_row = 'Ordinary Shares Number' if 'Ordinary Shares Number' in bs.index else ('Share Issued' if 'Share Issued' in bs.index else None)
            if share_row and current_shares is not None and current_shares > 0:
                reported_shares = bs.loc[share_row].dropna()
                if len(reported_shares) > 0:
                    latest_annual_shares = reported_shares.iloc[0]
                    if latest_annual_shares > 0:
                        share_growth = (current_shares / latest_annual_shares) - 1
                        if share_growth > 0.03: # >3% real-time dilution kills it
                            continue


            # --- Survives Hard Constraints! Calculate Coiled Spring ---
            mcap = info.get('marketCap')
            if not mcap:
                continue

            # FCF Yield (TTM Hybrid)
            fcf_ttm = np.nan
            if 'Free Cash Flow' in q_cf.index and q_cf.shape[1] >= 4:
                row_q = q_cf.loc['Free Cash Flow'].dropna()
                if len(row_q) >= 4:
                    fcf_ttm = row_q.iloc[0:4].sum()
            
            if pd.isna(fcf_ttm):
                ocf_ttm = get_ttm_sum(q_cf, cf, 'Operating Cash Flow')
                capex_ttm = get_ttm_sum(q_cf, cf, 'Capital Expenditure')
                if pd.notna(ocf_ttm) and pd.notna(capex_ttm):
                    fcf_ttm = ocf_ttm + capex_ttm

            if pd.isna(fcf_ttm):
                fcf_ttm = get_ttm_sum(q_cf, cf, 'Free Cash Flow')
            
            fcf_yield = (fcf_ttm / mcap) if pd.notna(fcf_ttm) and mcap > 0 else np.nan

            # Book-to-Market
            book_value = info.get('bookValue')
            current_price = info.get('currentPrice')
            if book_value and current_price and current_price > 0:
                bm_ratio = book_value / current_price
            else:
                if pd.notna(equity_latest) and mcap > 0:
                    bm_ratio = equity_latest / mcap
                else:
                    bm_ratio = np.nan

            # 5. The "Too Good To Be True" Anomaly Ceiling (Value Trap Defense)
            # Extreme outliers are almost always data errors, one-off liquidations, or impending bankruptcies.
            if pd.notna(fcf_yield) and fcf_yield > 0.30:
                continue
            if pd.notna(bm_ratio) and bm_ratio > 3.0:
                continue

            # Anti-Empire Builder Ratio
            asset_curr, asset_prev = safe_get_yoy_first_two(bs, 'Total Assets')
            ebitda_curr, ebitda_prev = safe_get_yoy_first_two(fin, 'EBITDA')
            
            asset_growth = np.nan
            if asset_curr is not None and asset_prev is not None and asset_prev > 0:
                asset_growth = (asset_curr / asset_prev) - 1
                
            ebitda_growth = np.nan
            if ebitda_curr is not None and ebitda_prev is not None and ebitda_prev > 0:
                ebitda_growth = (ebitda_curr / ebitda_prev) - 1
                
            anti_empire_flag = ""
            if pd.notna(asset_growth) and pd.notna(ebitda_growth):
                anti_empire_flag = str(bool(asset_growth <= ebitda_growth))

            # Margin Erosion Flag
            gross_prof_curr, gross_prof_prev = safe_get_yoy_first_two(fin, 'Gross Profit')
            rev_curr, rev_prev = safe_get_yoy_first_two(fin, 'Total Revenue')
            sga_curr, sga_prev = safe_get_yoy_first_two(fin, 'Selling General And Administration')
            
            margin_erosion_flag = ""
            op_leverage_flag = ""
            
            gm_curr = gross_prof_curr / rev_curr if (gross_prof_curr is not None and rev_curr is not None and rev_curr > 0) else np.nan
            gm_prev = gross_prof_prev / rev_prev if (gross_prof_prev is not None and rev_prev is not None and rev_prev > 0) else np.nan
            
            sga_rev_curr = sga_curr / rev_curr if (sga_curr is not None and rev_curr is not None and rev_curr > 0) else np.nan
            sga_rev_prev = sga_prev / rev_prev if (sga_prev is not None and rev_prev is not None and rev_prev > 0) else np.nan
            
            rev_growth = (rev_curr / rev_prev - 1) if (rev_curr is not None and rev_prev is not None and rev_prev > 0) else np.nan
            
            if pd.notna(gm_curr) and pd.notna(gm_prev) and pd.notna(sga_rev_curr) and pd.notna(sga_rev_prev):
                if gm_curr < gm_prev and sga_rev_curr > sga_rev_prev:
                    margin_erosion_flag = "True"
                else:
                    margin_erosion_flag = "False"
                    
            if pd.notna(rev_growth) and pd.notna(sga_rev_curr) and pd.notna(sga_rev_prev):
                if rev_growth > 0.10 and sga_rev_curr < sga_rev_prev:
                    op_leverage_flag = "True"
                else:
                    op_leverage_flag = "False"

            # --- TTM Valuations & Margins ---
            ttm_gross_profit = get_ttm_sum(q_fin, fin, 'Gross Profit')
            ttm_total_revenue = get_ttm_sum(q_fin, fin, 'Total Revenue')
            ttm_gross_margin = (ttm_gross_profit / ttm_total_revenue) if (pd.notna(ttm_gross_profit) and pd.notna(ttm_total_revenue) and ttm_total_revenue != 0) else np.nan

            # ---- EXTRA METRICS FOR PHASE 2 DASHBOARD ----
            price = safe_float(info.get('currentPrice'), 0.0)
            rev_growth_ttm = safe_float(info.get('revenueGrowth'), 0.0)
            trailing_pe = safe_float(info.get('trailingPE'), 100.0)
            peg_ratio = safe_float(info.get('pegRatio'), trailing_pe / (rev_growth_ttm * 100) if rev_growth_ttm else 100.0)
            insider_ownership = safe_float(info.get('heldPercentInsiders'), 0.0)
            
            # ROIC (TTM Hybrid)
            roic = 0.0
            ebit_ttm = get_ttm_sum(q_fin, fin, 'EBIT')
            try:
                if pd.isna(ebit_ttm):
                    net_inc_ttm = get_ttm_sum(q_fin, fin, 'Net Income')
                    tax_prov_ttm = get_ttm_sum(q_fin, fin, 'Tax Provision')
                    int_exp_ttm = get_ttm_sum(q_fin, fin, 'Interest Expense')
                    ebit_ttm = (net_inc_ttm if pd.notna(net_inc_ttm) else 0) + (tax_prov_ttm if pd.notna(tax_prov_ttm) else 0) + (int_exp_ttm if pd.notna(int_exp_ttm) else 0)
                
                tax_prov_ttm = get_ttm_sum(q_fin, fin, 'Tax Provision')
                pretax_inc_ttm = get_ttm_sum(q_fin, fin, 'Pretax Income')
                tax_rate = (tax_prov_ttm / pretax_inc_ttm) if pd.notna(tax_prov_ttm) and pd.notna(pretax_inc_ttm) and pretax_inc_ttm != 0 else 0.21
                
                nopat = ebit_ttm * (1 - tax_rate) if pd.notna(ebit_ttm) else 0
                
                total_equity = bs.loc['Stockholders Equity'].iloc[0] if 'Stockholders Equity' in bs.index else (bs.loc['Total Stockholder Equity'].iloc[0] if 'Total Stockholder Equity' in bs.index else 0)
                total_debt_bs = bs.loc['Total Debt'].iloc[0] if 'Total Debt' in bs.index else 0
                cash_bs = bs.loc['Cash And Cash Equivalents'].iloc[0] if 'Cash And Cash Equivalents' in bs.index else 0
                invested_capital = total_equity + total_debt_bs - cash_bs
                roic = nopat / invested_capital if invested_capital > 0 and pd.notna(nopat) else 0
            except:
                pass

            # Altman Z-Score
            z_score = 3.0
            try:
                total_assets = bs.loc['Total Assets'].iloc[0]
                current_assets = bs.loc['Current Assets'].iloc[0]
                current_liabilities = bs.loc['Current Liabilities'].iloc[0]
                working_capital = current_assets - current_liabilities
                retained_earnings = bs.loc['Retained Earnings'].iloc[0] if 'Retained Earnings' in bs.index else 0
                total_liabilities = bs.loc['Total Liabilities Net Minority Interest'].iloc[0] if 'Total Liabilities Net Minority Interest' in bs.index else (bs.loc['Total Liabilities'].iloc[0] if 'Total Liabilities' in bs.index else 0)
                
                A = working_capital / total_assets
                B = retained_earnings / total_assets
                C = (ebit_ttm / total_assets) if pd.notna(ebit_ttm) and ebit_ttm is not None else 0
                D = mcap / total_liabilities
                E = (ttm_total_revenue / total_assets) if pd.notna(ttm_total_revenue) else 0
                
                z_score = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
            except:
                pass

            # --- Phase 2 Automations ---
            automated_margin = ""
            try:
                if 'Operating Income' in fin.index and 'Total Revenue' in fin.index:
                    op_inc = fin.loc['Operating Income'].dropna()
                    tot_rev = fin.loc['Total Revenue'].dropna()
                    if len(op_inc) >= 2 and len(tot_rev) >= 2:
                        curr_m = op_inc.iloc[0] / tot_rev.iloc[0]
                        past_m = op_inc.iloc[1] / tot_rev.iloc[1] # 1 year check (yfinance limited to ~4 qtrs)
                        automated_margin = "Pass" if curr_m > past_m else "Fail"
            except: pass

            automated_insider = ""
            try:
                insides = stock.insider_purchases
                if insides is not None and not insides.empty:
                    automated_insider = "Pass"
                else:
                    trans = stock.insider_transactions
                    if trans is not None and not trans.empty:
                        automated_insider = "Pass" if "Buy" in str(trans.values) else "Fail"
                    else:
                        automated_insider = ""
            except: pass

            automated_cyclical = "Pass" # Default for non-cyclicals
            if industry and any(word in industry.lower() for word in ['semiconductor', 'shipping', 'oil', 'gas', 'energy', 'metal', 'mining', 'hardware', 'commodity']):
                # Cyclicals must be bought at maximum pessimism (high PE or negative PE) to avoid value traps
                if trailing_pe > 0 and trailing_pe < 15:
                    automated_cyclical = "Fail (Peak)"
                else:
                    automated_cyclical = "Pass (Pessimism)"

            automated_roic_vel = ""
            try:
                # Try to calculate past ROIC for true velocity
                if 'EBIT' in fin.index and fin.shape[1] > 1:
                    ebit_prev = safe_float(fin.loc['EBIT'].iloc[1])
                    tax_prov_prev = safe_float(fin.loc['Tax Provision'].iloc[1])
                    pretax_inc_prev = safe_float(fin.loc['Pretax Income'].iloc[1])
                    tax_rate_prev = (tax_prov_prev / pretax_inc_prev) if pd.notna(tax_prov_prev) and pd.notna(pretax_inc_prev) and pretax_inc_prev != 0 else 0.21
                    nopat_prev = ebit_prev * (1 - tax_rate_prev)

                    eq_prev = safe_float(bs.loc['Stockholders Equity'].iloc[1]) if 'Stockholders Equity' in bs.index and bs.shape[1] > 1 else (safe_float(bs.loc['Total Stockholder Equity'].iloc[1]) if 'Total Stockholder Equity' in bs.index and bs.shape[1] > 1 else 0)
                    debt_prev = safe_float(bs.loc['Total Debt'].iloc[1]) if 'Total Debt' in bs.index and bs.shape[1] > 1 else 0
                    cash_prev = safe_float(bs.loc['Cash And Cash Equivalents'].iloc[1]) if 'Cash And Cash Equivalents' in bs.index and bs.shape[1] > 1 else 0
                    ic_prev = eq_prev + debt_prev - cash_prev
                    
                    if ic_prev > 0 and pd.notna(nopat_prev):
                        past_roic = nopat_prev / ic_prev
                        automated_roic_vel = "Pass" if roic > past_roic else "Fail"
            except:
                pass

            surviving_data.append({
                'Ticker': ticker,
                'Name': info.get('shortName', ticker),
                'Sector': sector,
                'Industry': industry,
                'Price': price,
                'Market Cap': mcap,
                'FCF Yield': fcf_yield,
                'Book-to-Market Ratio': bm_ratio,
                'Anti-Empire Builder': anti_empire_flag,
                'Margin Erosion Danger': margin_erosion_flag,
                'Operating Leverage': op_leverage_flag,
                'Rev Growth': rev_growth_ttm,
                'Gross Margin': ttm_gross_margin if pd.notna(ttm_gross_margin) else (gm_curr if pd.notna(gm_curr) else 0.0),
                'ROIC': roic,
                'Insider Own': insider_ownership,
                'PEG': peg_ratio,
                'Z-Score': z_score,
                '8-Quarter Margin': automated_margin,
                'ROIC Velocity': automated_roic_vel,
                'Cyclical Check': automated_cyclical,
                'Insider Buying': automated_insider,
                'Phase 2 Decision': ""
            })

        except Exception as e:
            # Silently skip errors (or log them to file if needed)
            pass

    print("\nPhase 1 Data Gathering Complete.")
    df_results = pd.DataFrame(surviving_data)
    
    if df_results.empty:
        print("No tickers survived the hard constraints.")
        return
        
    # Save the final unranked list
    try:
        df_results.to_csv('public/data/phase1_progress.csv', index=False)
    except: pass

    # --- SECTOR RELATIVE RANKING ---
    # Top 25% FCF Yield AND Top 33% Book-to-Market within specific sector
    # A larger FCF Yield is better (usually). A larger Book-to-Market is also "cheaper" (value).
    # Since we want "Top 25%", those are the highest values (>= 75th percentile). 
    # For FCF Yield: top 25% meaning >= 0.75 quantile
    # For Book-to-Market: top 33% meaning >= 0.67 quantile

    df_results.dropna(subset=['FCF Yield', 'Book-to-Market Ratio'], inplace=True)
    
    # Calculate quantiles by sector
    grouped = df_results.groupby('Sector')
    
    fcf_thresholds = grouped['FCF Yield'].transform(lambda x: x.quantile(0.75))
    bm_thresholds = grouped['Book-to-Market Ratio'].transform(lambda x: x.quantile(0.67))
    
    # Filter
    condition_fcf = df_results['FCF Yield'] >= fcf_thresholds
    condition_bm = df_results['Book-to-Market Ratio'] >= bm_thresholds
    
    df_final = df_results[condition_fcf & condition_bm].copy()

    print(f"Total Starting Tickers: {len(tickers)}")
    print(f"Total Surviving Tickers (after ranking): {len(df_final)}")
    
    out_file = 'public/data/gdr_survivors_for_tradingview.csv'
    df_final.to_csv(out_file, index=False)
    print(f"Exported survivors to {out_file}.")

if __name__ == "__main__":
    main()
