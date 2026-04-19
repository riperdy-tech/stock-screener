import subprocess
import json
import os

def run():
    script_path = os.path.join(os.getcwd(), "scripts", "get_ticker_data_intl.py")
    
    # Reliance
    res1 = subprocess.check_output(["py", script_path, "--ticker", "RELIANCE.NS"], text=True)
    d1 = json.loads(res1)
    
    # Samsung
    res2 = subprocess.check_output(["py", script_path, "--ticker", "005930.KS"], text=True)
    d2 = json.loads(res2)
    
    def format_brief(data, currency="Rs."):
        calc = data.get('Calculated_Metrics', {})
        brief = f"""
### Company Ticker: {data.get('Ticker')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FINANCIAL DATA BRIEF — {data.get('Ticker')}
  Data As Of           : {data.get('Data_Fetched_Date', 'N/A')}
  Next Earnings Report : N/A
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── MARKET SNAPSHOT ──────────────────────
  Stock Price          : {currency} {data.get('Price', 0)}
  Fully Diluted Shares: {(data.get('Shares_Outstanding', 0)/1e6):.2f}M
  Market Cap          : {currency} {(data.get('Market_Cap', 0)/1e6):.2f}M
  Enterprise Value    : {currency} {(data.get('Enterprise_Value_EV', 0)/1e6):.2f}M
  Total Cash          : {currency} {(data.get('Total_Cash', 0)/1e6):.2f}M
  Total Debt          : {currency} {(data.get('Total_Debt', 0)/1e6):.2f}M
  Stock-Based Comp    : {currency} {(data.get('SBC_Stock_Based_Comp', 0)/1e6):.2f}M
  Operating Cash Flow : {currency} {(data.get('Operating_Cash_Flow', 0)/1e6):,.2f}M
  CapEx               : {currency} {(data.get('Capital_Expenditure', 0)/1e6):,.2f}M
  Free Cash Flow TTM  : {currency} {(data.get('Free_Cash_Flow_TTM', 0)/1e6):,.2f}M

── CALCULATED METRICS (TTM) ─────────────
  TTM Revenue         : {currency} {(calc.get('TTM_Revenue', 0)/1e6):.2f}M
  Gross Margin        : {(calc.get('TTM_Gross_Margin_%') or 0):.2f}%
  YoY Revenue Growth  : {(calc.get('YoY_Revenue_Growth_%') or 0):.2f}%
  FCF Margin          : {(calc.get('FCF_Margin_%') or 0):.2f}%
  Rule of 40          : {(calc.get('Rule_of_40') or 0):.2f}pts
  EV / Sales          : {(calc.get('EV_to_Sales') or 0):.2f}x
  EV / Gross Profit   : {(calc.get('EV_to_Gross_Profit') or 0):.2f}x
  EV / EBIT           : {(calc.get('EV_to_EBIT') or 0):.2f}x
  Core Anchor Multiple: {(calc.get('Core_Anchor_Multiple_0.4Sales_0.4GP') or 0):.2f}x

── ANNUAL INCOME STATEMENT ──────────────
"""
        for a in data.get('Annual_Income_Statement', []):
            brief += f"  Period: {a['Date']}\n"
            brief += f"    Revenue          : {currency} {(a['TotalRevenue']/1e6):.2f}M\n"
            brief += f"    Gross Profit     : {currency} {(a.get('GrossProfit', 0)/1e6):.2f}M\n"
            brief += f"    Operating Income : {currency} {(a['OperatingIncome']/1e6):.2f}M\n"
            brief += f"    Net Income       : {currency} {(a['NetIncome']/1e6):.2f}M\n"

        brief += "\n── QUARTERLY INCOME STATEMENT ───────────\n"
        for q in data.get('Quarterly_Income_Statement', []):
            brief += f"  Quarter: {q['Date']}\n"
            brief += f"    Revenue          : {currency} {(q['TotalRevenue']/1e6):.2f}M\n"
            brief += f"    Gross Profit     : {currency} {(q.get('GrossProfit', 0)/1e6):.2f}M\n"
            brief += f"    Operating Income : {currency} {(q['OperatingIncome']/1e6):.2f}M\n"
            brief += f"    Net Income       : {currency} {(q['NetIncome']/1e6):.2f}M\n"
            
        brief += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        return brief

    output = format_brief(d1, "Rs.")
    output += "\n" + format_brief(d2, "KRW")
    # Write to a file with utf-8 to avoid console encoding issues
    target_path = os.path.join(os.getcwd(), "prompt_examples.txt")
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(output)
    print(f"Examples written to {target_path}")

if __name__ == "__main__":
    run()
