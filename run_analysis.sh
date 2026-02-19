#!/bin/bash

# Anima 2B Style Explorer - Скрипт автоматизации
# Настраивает venv и запускает полный цикл анализа стилей

echo -e "\033[0;36m🎨 Starting Anima Style Analysis Pipeline...\033[0m"

# 1. Проверка виртуального окружения
if [ ! -d "venv" ]; then
    echo -e "\033[0;33m[*] Creating virtual environment...\033[0m"
    python3 -m venv venv
fi

# 2. Активация
echo -e "\033[0;33m[*] Activating virtual environment...\033[0m"
source venv/bin/activate

# 3. Конфигурация оборудования (Первый запуск или отсутствие Torch)
CONFIG_PATH=".torch_config"
TORCH_INSTALLED=$(python3 -c "import torch; print('YES')" 2>/dev/null)

if [ "$TORCH_INSTALLED" != "YES" ]; then
    if [ ! -f "$CONFIG_PATH" ]; then
        echo -e "\n\033[0;36m--- PyTorch + CUDA Configuration ---\033[0m"
        echo "This script will install the appropriate version of PyTorch for your system."
        echo "1) NVIDIA GPU (CUDA 13.0) - Latest Generation"
        echo "2) NVIDIA GPU (CUDA 12.8) - Recommended"
        echo "3) NVIDIA GPU (CUDA 12.6)"
        echo "4) CPU Only"
        
        read -p "Selection [1-4]: " choice
        case $choice in
            1) index_url="https://download.pytorch.org/whl/cu130" ;;
            2) index_url="https://download.pytorch.org/whl/cu128" ;;
            3) index_url="https://download.pytorch.org/whl/cu126" ;;
            4) index_url="CPU" ;;
            *) echo -e "\033[0;90mInvalid selection. Defaulting to CPU.\033[0m"; index_url="CPU" ;;
        esac
        echo "$index_url" > "$CONFIG_PATH"
    else
        index_url=$(cat "$CONFIG_PATH")
    fi

    echo -e "\033[0;33m[*] Installing PyTorch...\033[0m"
    if [ "$index_url" == "CPU" ]; then
        pip install torch torchvision torchaudio --quiet
    else
        pip install torch torchvision torchaudio --index-url "$index_url" --quiet
    fi
fi

# 4. Установка остальных зависимостей
echo -e "\033[0;33m[*] Checking remaining dependencies...\033[0m"
pip install -r requirements.txt --quiet

# 5. Запуск анализа
echo -e "\n\033[0;36m[1/2] 🧠 Running Stylistic AI Analysis (Ensemble)...\033[0m"
python3 analyze_styles.py

if [ $? -eq 0 ]; then
    # 6. Слияние данных
    echo -e "\n\033[0;36m[2/2] 💾 Merging results into frontend database...\033[0m"
    python3 merge_data.py
    echo -e "\n\033[0;32m✨ PIPELINE COMPLETE ✨\033[0m"
    echo "You can now refresh index.html to see the updated scores."
else
    echo -e "\n\033[0;31m❌ Analysis failed. Check errors above.\033[0m"
fi
