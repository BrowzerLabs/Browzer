@echo off
echo [%date% %time%] Starting agent setup...

REM Check Python version
echo [%date% %time%] Checking Python version...
python --version

REM Create virtual environment if it doesn't exist
if not exist venv (
  echo [%date% %time%] Creating virtual environment...
  python -m venv venv
) else (
  echo [%date% %time%] Virtual environment already exists
)

REM Activate virtual environment
echo [%date% %time%] Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo [%date% %time%] Installing dependencies...
pip install --upgrade pip
pip install -r requirements.txt

REM Test imports
echo [%date% %time%] Testing imports...
python -c "import nltk; import requests; import bs4; print('All imports successful')"

REM Download NLTK data
echo [%date% %time%] Setting up NLTK data...
python -c "import nltk; nltk.download('punkt'); nltk.download('stopwords')"

echo [%date% %time%] Setup completed successfully!
echo.
echo To run agents, make sure to activate the virtual environment first:
echo   venv\Scripts\activate
echo.
echo Then you can run the agents directly:
echo   python topic_agent.py "your search query"
echo   python crypto_agent.py "crypto" 