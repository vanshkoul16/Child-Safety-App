@echo off
title SafeHaven 24/7 Server
color 0A
echo ========================================================
echo   SafeHaven - Child Safety & Guardian Telemetry (24/7)
echo ========================================================
echo.
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please download and install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/2] Launching SafeHaven Node.js Server on port 3000...
start "" /b node local-server.js

:: Wait 1.5 seconds for port to open
powershell -Command "Start-Sleep -Milliseconds 1500" >nul 2>nul

echo [2/2] Opening SafeHaven in your default browser...
start "" http://localhost:3000/

echo.
echo ========================================================
echo   [LIVE] SafeHaven is running at: http://localhost:3000/
echo   Keep this window open to keep the server online.
echo   Press Ctrl+C or close this window to stop.
echo ========================================================
echo.

:: Keep script attached to node output or loop
node local-server.js
