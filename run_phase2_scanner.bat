@echo off
echo ===================================================
echo     PHASE 2 STOCK SCREENER (Decoupled Mode)
echo ===================================================
echo.
echo This script runs the Phase 2 Python screener independently.
echo It will update 'public/data/gdr_survivors_for_tradingview.csv'.
echo The web dashboard will automatically detect changes.
echo.
echo Press any key to START SCAN...
echo Press Ctrl+C to STOP completely.
pause

set PYTHONHOME=
py -u scripts/fetch_phase2_screener.py --csv "public/data/stocks.csv"

echo.
echo ===================================================
echo SCAN COMPLETE.
echo check public/data/gdr_survivors_for_tradingview.csv for your export.
echo ===================================================
pause
