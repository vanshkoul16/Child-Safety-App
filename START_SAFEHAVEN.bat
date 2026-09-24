@echo off
title SafeHaven 24/7 Server
color 0A
echo ========================================================
echo   SafeHaven - Child Safety & Guardian Telemetry (24/7)
echo ========================================================
echo.
cd /d "%~dp0"

echo [1/2] Checking local server...
start "" http://localhost:3000/

echo [2/2] Running SafeHaven server on http://localhost:3000/
echo Keep this window open or minimized to keep the app online 24/7.
echo.
node server.js

pause
