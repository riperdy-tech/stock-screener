@echo off
echo ===================================================
echo     TAIWAN STOCK SCANNER (TWSE)
echo ===================================================
echo.
echo This script fetches data for TWSE stocks.
echo It uses TWSE Open Data and yfinance.
echo.
echo Press any key to START SCAN...
pause

py -u scripts/fetch_taiwan.py

echo.
echo ===================================================
echo SCAN COMPLETE.
echo check public/data/stocks_taiwan.csv for your export.
echo ===================================================
pause
