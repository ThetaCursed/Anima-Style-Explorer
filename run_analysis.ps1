# Anima 2B Style Explorer - Automation Script
# Sets up venv and runs the full stylistic analysis pipeline

Write-Host "🎨 Starting Anima Style Analysis Pipeline..." -ForegroundColor Cyan

# 1. Check for Virtual Environment
if (-Not (Test-Path "venv")) {
    Write-Host "[*] Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# 2. Activate and Install
Write-Host "[*] Checking dependencies..." -ForegroundColor Yellow
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt --quiet

# 3. Run Analysis
Write-Host "`n[1/2] 🧠 Running Stylistic AI Analysis (Ensemble)..." -ForegroundColor Cyan
python analyze_styles.py

if ($LASTEXITCODE -eq 0) {
    # 4. Run Merge
    Write-Host "`n[2/2] 💾 Merging results into frontend database..." -ForegroundColor Cyan
    python merge_data.py
    Write-Host "`n✨ PIPELINE COMPLETE ✨" -ForegroundColor Green
    Write-Host "You can now refresh index.html to see the updated scores."
} else {
    Write-Host "`n❌ Analysis failed. Check errors above." -ForegroundColor Red
}
