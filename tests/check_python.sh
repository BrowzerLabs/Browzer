#!/bin/bash

# Browzer Python Setup Checker
echo "🔍 Checking Python setup for Browzer AI agents..."
echo "=================================================="

# Check if Python 3 is available
echo "1. Checking Python 3 availability:"

if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo "   ✅ python3 found: $PYTHON_VERSION"
    PYTHON_PATH=$(which python3)
    echo "   📁 Location: $PYTHON_PATH"
else
    echo "   ❌ python3 not found in PATH"
fi

if command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version 2>&1)
    echo "   ✅ python found: $PYTHON_VERSION"
    PYTHON_PATH=$(which python)
    echo "   📁 Location: $PYTHON_PATH"
else
    echo "   ❌ python not found in PATH"
fi

# Check specific paths where Python might be installed
echo ""
echo "2. Checking common Python installation locations:"
COMMON_PATHS=(
    "/usr/bin/python3"
    "/usr/local/bin/python3"
    "/opt/homebrew/bin/python3"
    "/usr/bin/python"
    "/usr/local/bin/python"
)

for path in "${COMMON_PATHS[@]}"; do
    if [ -f "$path" ]; then
        VERSION=$($path --version 2>&1)
        echo "   ✅ Found: $path ($VERSION)"
    else
        echo "   ❌ Not found: $path"
    fi
done

# Check PATH
echo ""
echo "3. Current PATH:"
echo "   $PATH"

# Check if Python packages are available
echo ""
echo "4. Checking required Python packages:"
PACKAGES=("requests" "beautifulsoup4" "python-dotenv")

for package in "${PACKAGES[@]}"; do
    if python3 -c "import $package" 2>/dev/null; then
        echo "   ✅ $package is installed"
    else
        echo "   ❌ $package is NOT installed"
    fi
done

echo ""
echo "📋 Setup Recommendations:"
echo "========================="

if ! command -v python3 &> /dev/null; then
    echo "🔧 Install Python 3:"
    echo "   • Download from: https://python.org/downloads"
    echo "   • Or use Homebrew: brew install python3"
    echo "   • Make sure to check 'Add to PATH' during installation"
fi

echo ""
echo "🔧 Install required packages:"
echo "   pip3 install requests beautifulsoup4 python-dotenv openai anthropic"

echo ""
echo "🔧 Add Python to PATH (if needed):"
echo "   Add this line to your ~/.zshrc or ~/.bash_profile:"
echo "   export PATH=\"/usr/local/bin:\$PATH\""

echo ""
echo "✅ Test your setup:"
echo "   python3 --version"
echo "   python3 -c \"import requests; print('Python setup OK!')\"" 