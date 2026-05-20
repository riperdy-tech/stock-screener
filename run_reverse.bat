@echo off
echo ===================================================
echo     REVERSE SCREENING ENGINE (Scaffold Mode)
echo ===================================================
echo.
echo This script adds empty reverse-engine result objects to local data.
echo It reads public/data/stocks.json and per-ticker financial JSON files.
echo It does not fetch market data or touch public/data/stocks.csv.
echo.
echo Press any key to START REVERSE SCAFFOLD...
echo Press Ctrl+C to STOP completely.
pause

set PYTHONHOME=
py -u scripts/score_reverse.py

echo.
echo ===================================================
echo REVERSE SCAFFOLD COMPLETE.
echo Check public/data/reverse_scores.json for the output.
echo ===================================================
pause
