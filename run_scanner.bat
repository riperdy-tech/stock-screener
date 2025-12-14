@echo off
echo ===================================================
echo     MANUAL STOCK DATA FETCHER (Decoupled Mode)
echo ===================================================
echo.
echo This script runs the Python fetcher independently from the web app.
echo It will update 'public/data/stocks.json' and 'public/data/stocks.csv'.
echo The web dashboard will automatically detect changes.
echo.
echo Press any key to START SCAN...
echo Press Ctrl+C to STOP completely.
pause

set PYTHONHOME=
py -u scripts/fetch_data.py

echo.
echo ===================================================
echo SCAN COMPLETE.
echo check public/data/stocks.csv for your export.
echo ===================================================
pause
