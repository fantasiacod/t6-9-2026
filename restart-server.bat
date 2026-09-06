@echo off
echo ====================================
echo   Restarting Enterprise Task Server
echo ====================================
echo.
echo Stopping old server...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.
REM Always run from THIS file's folder. The old version had a hardcoded
REM path to an earlier copy of the project, so it started the wrong code.
cd /d "%~dp0"
echo Starting server from: %CD%
node server/app.js
pause
