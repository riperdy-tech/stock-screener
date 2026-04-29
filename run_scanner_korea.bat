@echo off
echo ===================================================
echo     KOREA STOCK SCANNER (KRX)
echo ===================================================
echo.
echo This script fetches data for KOSPI and KOSDAQ stocks.
echo It uses FinanceDataReader and Naver Finance.
echo.
echo Press any key to START SCAN...
pause

py -u scripts/fetch_korea.py

echo.
echo ===================================================
echo SCAN COMPLETE.
echo check public/data/stocks_korea.csv for your export.
echo ===================================================
pause
