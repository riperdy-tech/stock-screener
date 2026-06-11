@echo off
REM Run the full scoring chain: macro -> score_reverse -> score_paradigm
REM with data-integrity invariants. See scripts/run_chain.py.
cd /d "%~dp0"
python scripts\run_chain.py %*
if errorlevel 1 (
    echo.
    echo CHAIN FAILED - see invariant report above and public\data\chain_manifest.json
    pause
)
