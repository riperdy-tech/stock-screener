@echo off
echo ===================================================
echo     INTERNATIONAL STOCK SCANNER (India + Korea)
echo ===================================================
echo.
echo This script fetches data for NIFTY 500 and KRX stocks.
echo It uses nsepython and FinanceDataReader.
echo.
echo Press any key to START SCAN...
pause

py -u scripts/fetch_data_intl.py

echo.
echo ===================================================
echo SCAN COMPLETE.
echo check public/data/stocks_intl.csv for your export.
echo ===================================================
pause
