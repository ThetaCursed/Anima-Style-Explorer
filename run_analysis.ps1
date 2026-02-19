# Anima 2B Style Explorer - Скрипт автоматизации
# Настраивает venv и запускает полный цикл анализа стилей

Write-Host "🎨 Starting Anima Style Analysis Pipeline..." -ForegroundColor Cyan

# 1. Проверка виртуального окружения
if (-Not (Test-Path "venv")) {
    Write-Host "[*] Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# 2. Активация
Write-Host "[*] Activating virtual environment..." -ForegroundColor Yellow
.\venv\Scripts\Activate.ps1

# 3. Конфигурация оборудования (Первый запуск или отсутствие Torch)
$configPath = ".torch_config"
$torchInstalled = python -c "import torch; print('YES')" 2>$null

if ($torchInstalled -ne "YES") {
    if (-Not (Test-Path $configPath)) {
        Write-Host "`n--- PyTorch + CUDA Configuration ---" -ForegroundColor Cyan
        Write-Host "This script will install the appropriate version of PyTorch for your system."
        Write-Host "1) NVIDIA GPU (CUDA 13.0) - Latest Generation"
        Write-Host "2) NVIDIA GPU (CUDA 12.8) - Recommended"
        Write-Host "3) NVIDIA GPU (CUDA 12.6)"
        Write-Host "4) CPU Only"
        
        $choice = Read-Host "Selection [1-4]"
        switch ($choice) {
            "1" { $indexUrl = "https://download.pytorch.org/whl/cu130" }
            "2" { $indexUrl = "https://download.pytorch.org/whl/cu128" }
            "3" { $indexUrl = "https://download.pytorch.org/whl/cu126" }
            "4" { $indexUrl = "CPU" }
            default { 
                Write-Host "Invalid selection. Defaulting to CPU." -ForegroundColor Gray
                $indexUrl = "CPU" 
            }
        }
        $indexUrl | Out-File -FilePath $configPath -Encoding utf8
    } else {
        $indexUrl = (Get-Content $configPath).Trim()
    }

    Write-Host "[*] Installing PyTorch..." -ForegroundColor Yellow
    if ($indexUrl -eq "CPU") {
        pip install torch torchvision torchaudio --quiet
    } else {
        pip install torch torchvision torchaudio --index-url $indexUrl --quiet
    }
}

# 4. Установка остальных зависимостей
Write-Host "[*] Checking remaining dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt --quiet

# 5. Запуск анализа
Write-Host "`n[1/2] 🧠 Running Stylistic AI Analysis (Ensemble)..." -ForegroundColor Cyan
python analyze_styles.py

if ($LASTEXITCODE -eq 0) {
    # 6. Слияние данных
    Write-Host "`n[2/2] 💾 Merging results into frontend database..." -ForegroundColor Cyan
    python merge_data.py
    Write-Host "`n✨ PIPELINE COMPLETE ✨" -ForegroundColor Green
    Write-Host "You can now refresh index.html to see the updated scores."
} else {
    Write-Host "`n❌ Analysis failed. Check errors above." -ForegroundColor Red
}
