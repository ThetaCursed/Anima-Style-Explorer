@echo off
setlocal enabledelayedexpansion

:: Anima 2B Style Explorer - Скрипт автоматизации
:: Настраивает venv и запускает полный цикл анализа стилей

echo Starting Anima Style Analysis Pipeline...

:: 1. Проверка виртуального окружения
if not exist "venv" (
    echo [*] Creating virtual environment...
    python -m venv venv
)

:: 2. Активация
echo [*] Activating virtual environment...
call venv\Scripts\activate.bat

:: 3. Конфигурация оборудования (Первый запуск или отсутствие Torch)
set CONFIG_PATH=.torch_config
python -c "import torch; print('YES')" > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if not exist "%CONFIG_PATH%" (
        echo.
        echo --- PyTorch + CUDA Configuration ---
        echo This script will install the appropriate version of PyTorch for your system.
        echo 1) NVIDIA GPU (CUDA 13.0) - Latest Generation
        echo 2) NVIDIA GPU (CUDA 12.8) - Recommended
        echo 3) NVIDIA GPU (CUDA 12.6)
        echo 4) CPU Only
        
        set /p choice="Selection [1-4]: "
        if "!choice!"=="1" set INDEX_URL=https://download.pytorch.org/whl/cu130
        if "!choice!"=="2" set INDEX_URL=https://download.pytorch.org/whl/cu128
        if "!choice!"=="3" set INDEX_URL=https://download.pytorch.org/whl/cu126
        if "!choice!"=="4" set INDEX_URL=CPU
        if "!INDEX_URL!"=="" (
            echo Invalid selection. Defaulting to CPU.
            set INDEX_URL=CPU
        )
        echo !INDEX_URL! > "%CONFIG_PATH%"
    ) else (
        set /p INDEX_URL=<"%CONFIG_PATH%"
        set INDEX_URL=!INDEX_URL: =!
    )

    echo [*] Installing PyTorch...
    if "!INDEX_URL!"=="CPU" (
        pip install torch torchvision torchaudio --quiet
    ) else (
        pip install torch torchvision torchaudio --index-url !INDEX_URL! --quiet
    )
)

:: 4. Установка остальных зависимостей
echo [*] Checking remaining dependencies...
pip install -r requirements.txt --quiet

:: 5. Запуск анализа
echo.
echo [1/2] Running Stylistic AI Analysis (Ensemble)...
python analyze_styles.py

if %ERRORLEVEL% EQU 0 (
    :: 6. Слияние данных
    echo.
    echo [2/2] Merging results into frontend database...
    python merge_data.py
    echo.
    echo PIPELINE COMPLETE
    echo You can now refresh index.html to see the updated scores.
) else (
    echo.
    echo Analysis failed. Check errors above.
)

pause
