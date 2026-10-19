@echo off
setlocal
cd /d "%~dp0"
title Connect SafeHaven to Render
color 0D

echo ========================================================
echo   SafeHaven - Connect to Render.com (24/7 Cloud Hosting)
echo ========================================================
echo.
echo Choose how you want to connect to Render:
echo.
echo   [1] 1-Click Render Blueprint Deploy (RECOMMENDED)
echo   [2] Open Render New Web Service Dashboard
echo.
set /p choice="Enter choice [1 or 2] (default is 1): "
if "%choice%"=="" set choice=1

if "%choice%"=="1" (
    echo.
    echo [SafeHaven] Opening Render 1-Click Blueprint Deploy in your browser...
    echo Repository: https://github.com/vanshkoul16/Child-Safety-App
    echo Blueprint:  render.yaml
    echo.
    start "" "https://render.com/deploy?repo=https://github.com/vanshkoul16/Child-Safety-App"
    echo After signing in to Render, click "Apply" to launch your 24/7 web service!
    echo.
    pause
    exit /b
)

if "%choice%"=="2" (
    echo.
    echo [SafeHaven] Opening Render Web Service creation page...
    start "" "https://dashboard.render.com/select-repo?type=web"
    echo Select repository "vanshkoul16/Child-Safety-App", set Build Command to "npm install", and Start Command to "node local-server.js".
    echo.
    pause
    exit /b
)

pause
