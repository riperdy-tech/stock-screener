@echo off
echo ===================================================
echo     GIT DATA PUSH AUTOMATION
echo ===================================================
echo.
echo Running international data compiler...
py -u scripts/compile_intl_csv.py

echo.
echo Staging all updated data files (CSV and JSON)...

git add public/data/*.csv
git add public/data/financials/*.json
git add public/data/reports/*.json

echo.
echo Committing changes...
git commit -m "Update stock data: Scheduled country refresh results"

echo Pulling latest changes from remote...
git pull --rebase origin main

echo.
echo Pushing to GitHub...
git push origin main

echo.
echo ===================================================
echo PUSH COMPLETE.
echo ===================================================
pause
