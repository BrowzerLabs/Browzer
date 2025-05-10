#!/bin/bash

# Setup script for Python agents

# Exit on error
set -e

# Log function
log() {
  echo "[$(date)] $1"
}

log "Starting agent setup..."

# Check Python version
log "Checking Python version..."
python3 --version || python --version

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
  log "Creating virtual environment..."
  python3 -m venv venv || python -m venv venv
else
  log "Virtual environment already exists"
fi

# Activate virtual environment
log "Activating virtual environment..."
if [ -f "venv/bin/activate" ]; then
  source venv/bin/activate
elif [ -f "venv/Scripts/activate" ]; then
  source venv/Scripts/activate
else
  log "ERROR: Could not find activation script for virtual environment"
  exit 1
fi

# Install dependencies
log "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

log "Testing imports..."
python -c "import nltk; import requests; import bs4; print('All imports successful')"

# Download NLTK data
log "Setting up NLTK data..."
python -c "import nltk; nltk.download('punkt'); nltk.download('stopwords')"

log "Setup completed successfully!"
echo ""
echo "To run agents, make sure to activate the virtual environment first:"
echo "  source venv/bin/activate (Linux/Mac)"
echo "  venv\\Scripts\\activate (Windows)"
echo ""
echo "Then you can run the agents directly:"
echo "  python topic_agent.py 'your search query'"
echo "  python crypto_agent.py 'crypto'" 