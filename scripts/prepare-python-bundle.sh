#!/bin/bash

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Use provided directory or default to local python-bundle
if [ -n "$1" ]; then
    PYTHON_BUNDLE_DIR="$1"
    echo "🎯 Using custom bundle directory: $PYTHON_BUNDLE_DIR"
elif [ -n "$PYTHON_BUNDLE_DIR" ]; then
    echo "🎯 Using environment variable bundle directory: $PYTHON_BUNDLE_DIR"
else
    PYTHON_BUNDLE_DIR="$ROOT_DIR/python-bundle"
    echo "📦 Using default bundle directory: $PYTHON_BUNDLE_DIR"
fi

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

# Use Python 3.13 for consistency across all builds
PYTHON_VERSION="3.13"
PYTHON_FULL_VERSION="3.13.5"
echo "🔧 Using Python $PYTHON_FULL_VERSION for consistent builds..."

# Create a minimal Python environment using the system Python
echo "🔧 Creating portable Python environment..."

# Create directory structure for Python 3.13
mkdir -p "$PYTHON_BUNDLE_DIR/python-runtime/lib/python$PYTHON_VERSION/site-packages"
mkdir -p "$PYTHON_BUNDLE_DIR/python-runtime/bin"

# Create a Python wrapper script instead of copying the binary
# Get the actual Python executable path
ACTUAL_PYTHON=$(which python$PYTHON_VERSION || which python3)
echo "Using Python executable: $ACTUAL_PYTHON"

cat > "$PYTHON_BUNDLE_DIR/python-runtime/bin/python" << EOF
#!/bin/bash
# Python wrapper for Browzer bundle
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="\$(dirname "\$SCRIPT_DIR")"
export PYTHONPATH="\$BUNDLE_DIR/lib/python$PYTHON_VERSION/site-packages:\$PYTHONPATH"
exec "$ACTUAL_PYTHON" "\$@"
EOF
chmod +x "$PYTHON_BUNDLE_DIR/python-runtime/bin/python"

# Set PYTHONPATH for installations
export PYTHONPATH="$PYTHON_BUNDLE_DIR/python-runtime/lib/python$PYTHON_VERSION/site-packages:$PYTHONPATH"

# Install pip to our custom location
python3 -m pip install --target "$PYTHON_BUNDLE_DIR/python-runtime/lib/python$PYTHON_VERSION/site-packages" --upgrade pip

echo "📦 Installing required packages..."

# First install packages without binary dependencies
python3 -m pip install --target "$PYTHON_BUNDLE_DIR/python-runtime/lib/python$PYTHON_VERSION/site-packages" \
    requests==2.32.3 \
    beautifulsoup4==4.13.4 \
    python-dotenv==1.1.0 \
    openai==1.82.0 \
    anthropic==0.52.0 \
    google-auth==2.40.3 \
    google-genai==1.36.0 \
    --no-cache-dir

# Install regex separately with forced compilation
echo "🔧 Installing regex with forced compilation..."
python3 -m pip install --target "$PYTHON_BUNDLE_DIR/python-runtime/lib/python$PYTHON_VERSION/site-packages" \
    regex \
    --no-cache-dir \
    --force-reinstall \
    --no-binary=regex \
    --compile

# Install NLTK separately with forced compilation
echo "🔧 Installing NLTK with forced compilation..."
python3 -m pip install --target "$PYTHON_BUNDLE_DIR/python-runtime/lib/python$PYTHON_VERSION/site-packages" \
    nltk==3.8.1 \
    --no-cache-dir \
    --force-reinstall \
    --no-binary=nltk \
    --compile

# Download NLTK data needed by the agents
echo "📚 Downloading NLTK data..."
PYTHONPATH="$PYTHON_BUNDLE_DIR/python-runtime/lib/python$PYTHON_VERSION/site-packages:$PYTHONPATH" python3 -c "
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
cat > "$PYTHON_BUNDLE_DIR/python-runtime/python-launcher.sh" << EOF
#!/bin/bash
# Portable Python launcher for Browzer
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH="\$SCRIPT_DIR/lib/python$PYTHON_VERSION/site-packages:\$PYTHONPATH"
exec "\$SCRIPT_DIR/bin/python" "\$@"
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

echo "✅ Testing the Python bundle..."
"$PYTHON_BUNDLE_DIR/python-runtime/bin/python" "$PYTHON_BUNDLE_DIR/python-runtime/verify.py"

# Make the bundle more portable
echo "🔄 Making bundle portable..."

# Create a simple pyvenv.cfg for compatibility
cat > "$PYTHON_BUNDLE_DIR/python-runtime/pyvenv.cfg" << EOF
home = .
include-system-site-packages = false
version = $PYTHON_FULL_VERSION
EOF

# Create bundle info
cat > "$PYTHON_BUNDLE_DIR/bundle-info.json" << EOF
{
    "version": "$PYTHON_FULL_VERSION",
    "architecture": "$PYTHON_ARCH",
    "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "packages": [
        "requests==2.32.3",
        "beautifulsoup4==4.13.4", 
        "python-dotenv==1.1.0",
        "openai==1.82.0",
        "anthropic==0.52.0",
        "nltk==3.8.1",
        "google-auth==2.40.3",
        "google-genai==1.36.0"
    ]
}
EOF

echo "📊 Bundle statistics:"
echo "   Size: $(du -sh "$PYTHON_BUNDLE_DIR" | cut -f1)"
echo "   Location: $PYTHON_BUNDLE_DIR"

echo ""
echo "✅ Python bundle prepared successfully!"
echo "   The bundle is ready to be included in the app build." 