#!/bin/bash

echo -e "\033[0;36m🎨 Starting Anima Style Analysis Pipeline...\033[0m"

# 1. Check for Virtual Environment
if [ ! -d "venv" ]; then
    echo -e "\033[0;33m[*] Creating virtual environment...\033[0m"
    python3 -m venv venv
fi

# 2. Activate and Install
echo -e "\033[0;33m[*] Checking dependencies...\033[0m"
source venv/bin/activate
pip install -r requirements.txt --quiet

# 3. Run Analysis
echo -e "\n\033[0;36m[1/2] 🧠 Running Stylistic AI Analysis (Ensemble)...\033[0m"
python3 analyze_styles.py

if [ $? -eq 0 ]; then
    # 4. Run Merge
    echo -e "\n\033[0;36m[2/2] 💾 Merging results into frontend database...\033[0m"
    python3 merge_data.py
    echo -e "\n\033[0;32m✨ PIPELINE COMPLETE ✨\033[0m"
    echo "You can now refresh index.html to see the updated scores."
else
    echo -e "\n\033[0;31m❌ Analysis failed. Check errors above.\033[0m"
fi
