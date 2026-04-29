@echo off
echo ===================================================
echo     INDIA STOCK SCANNER (NIFTY 500)
echo ===================================================
echo.
echo This script fetches data for NIFTY 500 stocks.
echo It uses nsepython and deep fetcher logic.
echo.
echo Press any key to START SCAN...
pause

py -u scripts/fetch_india.py

echo.
echo ===================================================
echo SCAN COMPLETE.
echo check public/data/stocks_india.csv for your export.
echo ===================================================
pause
