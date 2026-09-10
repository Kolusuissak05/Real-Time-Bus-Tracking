@echo off
cd /d "C:\mcp-play\bus-platform\frontend"

if not exist node_modules goto DO_INSTALL
echo node_modules found, skipping install.
goto START_VITE

:DO_INSTALL
echo Installing npm packages (first run - takes about a minute)...
call npm install
if errorlevel 1 goto INSTALL_ERROR
goto START_VITE

:INSTALL_ERROR
echo ERROR: npm install failed!
pause
exit /b 1

:START_VITE
echo.
echo ==========================================
echo  Frontend starting on http://localhost:5173
echo  Press Ctrl+C to stop
echo ==========================================
echo.
call npm run dev
if errorlevel 1 goto TRY_NPXVITE
goto END

:TRY_NPXVITE
echo npm run dev failed, trying npx vite directly...
call npx vite --port 5173

:END
pause
