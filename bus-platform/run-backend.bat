@echo off
cd /d "C:\mcp-play\bus-platform\backend"
if not exist venv (
    echo Creating Python virtual environment...
    python -m venv venv
)
call venv\Scripts\activate.bat
echo Installing / verifying Python packages...
pip install -r requirements.txt --quiet
echo.
echo ==========================================
echo  Backend starting on http://127.0.0.1:8000
echo  API docs: http://127.0.0.1:8000/docs
echo  Press Ctrl+C to stop
echo ==========================================
echo.
uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
