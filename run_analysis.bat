@echo off
echo 🎨 Starting Anima Style Analysis Pipeline...

:: 1. Check for Virtual Environment
if not exist "venv" (
    echo [*] Creating virtual environment...
    python -m venv venv
)

:: 2. Activate and Install
echo [*] Checking dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet

:: 3. Run Analysis
echo.
echo [1/2] 🧠 Running Stylistic AI Analysis (Ensemble)...
python analyze_styles.py

if %ERRORLEVEL% EQU 0 (
    :: 4. Run Merge
    echo.
    echo [2/2] 💾 Merging results into frontend database...
    python merge_data.py
    echo.
    echo ✨ PIPELINE COMPLETE ✨
    echo You can now refresh index.html to see the updated scores.
) else (
    echo.
    echo ❌ Analysis failed. Check errors above.
)
pause
