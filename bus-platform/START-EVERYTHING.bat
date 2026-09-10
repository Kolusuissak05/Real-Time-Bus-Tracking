@echo off
setlocal

echo ============================================
echo  BusTrack India v2  -  Full Launcher
echo ============================================
echo.

:: ---------- Check Python ----------
python --version >nul 2>&1
if errorlevel 1 goto NO_PYTHON
goto CHECK_NODE

:NO_PYTHON
echo ERROR: Python not found.
echo Download: https://www.python.org/downloads/
echo Make sure to check "Add Python to PATH" during install.
pause
exit /b 1

:CHECK_NODE
node --version >nul 2>&1
if errorlevel 1 goto NO_NODE
goto CHECKS_DONE

:NO_NODE
echo ERROR: Node.js not found.
echo Download: https://nodejs.org/
pause
exit /b 1

:CHECKS_DONE
echo Python ... OK
echo Node.js ... OK
echo.

:: ---------- Launch backend ----------
echo [1/3] Starting backend window...
start "BusTrack BACKEND :8000" cmd /k "C:\mcp-play\bus-platform\run-backend.bat"

echo Waiting 12 seconds for backend to boot...
timeout /t 12 /nobreak > nul

:: ---------- Launch frontend ----------
echo [2/3] Starting frontend window...
start "BusTrack FRONTEND :5173" cmd /k "C:\mcp-play\bus-platform\run-frontend.bat"

:: ---------- Wait for Vite to actually be ready ----------
echo Waiting for Vite to be ready on port 5173...
echo (This may take up to 60 seconds on first run)
echo.

set TRIES=0

:WAIT_LOOP
set /a TRIES+=1
if %TRIES% GTR 30 goto OPEN_BROWSER_WARN

powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',5173); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 goto OPEN_BROWSER_READY

timeout /t 2 /nobreak > nul
goto WAIT_LOOP

:OPEN_BROWSER_WARN
echo WARNING: Frontend did not respond after 60s - opening anyway, refresh if blank.
goto DO_OPEN

:OPEN_BROWSER_READY
echo Vite is ready!

:DO_OPEN
echo.
echo [3/3] Opening browser...
start http://localhost:5173

echo.
echo ============================================
echo  App:    http://localhost:5173
echo  Admin:  http://localhost:5173/admin
echo  Driver: http://localhost:5173/driver
echo  API:    http://localhost:8000/docs
echo ============================================
echo.
echo KEEP BOTH SERVER WINDOWS OPEN.
echo This launcher window can be closed.
echo.
pause
