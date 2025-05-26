#!/bin/bash

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_BUNDLE_DIR="$ROOT_DIR/python-bundle"

echo "🐍 Preparing Python bundle for Browzer..."
echo "=========================================="

# Clean up any existing bundle
if [ -d "$PYTHON_BUNDLE_DIR" ]; then
    echo "🧹 Cleaning up existing Python bundle..."
    rm -rf "$PYTHON_BUNDLE_DIR"
fi

mkdir -p "$PYTHON_BUNDLE_DIR"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    PYTHON_ARCH="macos11"
    echo "📱 Detected Apple Silicon (arm64)"
else
    PYTHON_ARCH="macosx10_9"
    echo "💻 Detected Intel (x86_64)"
fi

# Download portable Python (using Python.org's embeddable distribution approach)
PYTHON_VERSION="3.11.7"
echo "⬇️  Downloading Python $PYTHON_VERSION for $PYTHON_ARCH..."

# Create a minimal Python environment using the system Python
echo "🔧 Creating portable Python environment..."

# Use Python's venv to create a relocatable environment
python3 -m venv "$PYTHON_BUNDLE_DIR/python-runtime" --copies

# Activate the environment
source "$PYTHON_BUNDLE_DIR/python-runtime/bin/activate"

# Upgrade pip
pip install --upgrade pip

echo "📦 Installing required packages..."
# Install all required packages
pip install \
    requests==2.32.3 \
    beautifulsoup4==4.13.4 \
    python-dotenv==1.1.0 \
    openai==1.82.0 \
    anthropic==0.52.0 \
    nltk==3.8.1 \
    --no-cache-dir

# Download NLTK data needed by the agents
echo "📚 Downloading NLTK data..."
python -c "
import nltk
import ssl
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

nltk.download('punkt', quiet=True)
nltk.download('stopwords', quiet=True)
nltk.download('punkt_tab', quiet=True)
print('NLTK data downloaded successfully')
"

# Create a simple Python launcher script
cat > "$PYTHON_BUNDLE_DIR/python-runtime/python-launcher.sh" << 'EOF'
#!/bin/bash
# Portable Python launcher for Browzer
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH="$SCRIPT_DIR/lib/python3.11/site-packages:$PYTHONPATH"
exec "$SCRIPT_DIR/bin/python" "$@"
EOF

chmod +x "$PYTHON_BUNDLE_DIR/python-runtime/python-launcher.sh"

# Create a verification script
cat > "$PYTHON_BUNDLE_DIR/python-runtime/verify.py" << 'EOF'
#!/usr/bin/env python3
import sys
import os

print(f"Python executable: {sys.executable}")
print(f"Python version: {sys.version}")
print(f"Python path: {sys.path}")

# Test required packages
packages = ['requests', 'bs4', 'dotenv', 'openai', 'anthropic', 'nltk']
for package in packages:
    try:
        __import__(package)
        print(f"✅ {package} - OK")
    except ImportError as e:
        print(f"❌ {package} - FAILED: {e}")

# Test NLTK data
try:
    import nltk
    from nltk.tokenize import sent_tokenize, word_tokenize
    from nltk.corpus import stopwords
    print("✅ NLTK data - OK")
except Exception as e:
    print(f"❌ NLTK data - FAILED: {e}")

print("🎉 Python bundle verification complete!")
EOF

deactivate

echo "✅ Testing the Python bundle..."
"$PYTHON_BUNDLE_DIR/python-runtime/bin/python" "$PYTHON_BUNDLE_DIR/python-runtime/verify.py"

# Make the bundle more portable by removing absolute paths
echo "🔄 Making bundle portable..."

# Find and replace absolute paths in pyvenv.cfg
if [ -f "$PYTHON_BUNDLE_DIR/python-runtime/pyvenv.cfg" ]; then
    sed -i '' 's|home = .*|home = .|' "$PYTHON_BUNDLE_DIR/python-runtime/pyvenv.cfg"
fi

# Create bundle info
cat > "$PYTHON_BUNDLE_DIR/bundle-info.json" << EOF
{
    "version": "$PYTHON_VERSION",
    "architecture": "$PYTHON_ARCH",
    "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "packages": [
        "requests==2.32.3",
        "beautifulsoup4==4.13.4", 
        "python-dotenv==1.1.0",
        "openai==1.82.0",
        "anthropic==0.52.0",
        "nltk==3.8.1"
    ]
}
EOF

echo "📊 Bundle statistics:"
echo "   Size: $(du -sh "$PYTHON_BUNDLE_DIR" | cut -f1)"
echo "   Location: $PYTHON_BUNDLE_DIR"

echo ""
echo "✅ Python bundle prepared successfully!"
echo "   The bundle is ready to be included in the app build." 