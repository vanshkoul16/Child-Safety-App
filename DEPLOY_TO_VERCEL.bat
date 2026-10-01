@echo off
setlocal
cd /d "%~dp0"
title Connect SafeHaven to Vercel
color 0B

echo ========================================================
echo   SafeHaven - Connect to Vercel (24/7 Cloud Hosting)
echo ========================================================
echo.
echo Choose how you want to connect to Vercel:
echo.
echo   [1] 1-Click GitHub Import (RECOMMENDED - Auto-deploys on every git push)
echo   [2] Deploy via Vercel CLI (terminal)
echo.
set /p choice="Enter choice [1 or 2] (default is 1): "
if "%choice%"=="" set choice=1

if "%choice%"=="1" (
    echo.
    echo [SafeHaven] Opening Vercel 1-Click Import in your browser...
    echo Repository: https://github.com/vanshkoul16/Child-Safety-App
    echo.
    start "" "https://vercel.com/new/import?s=https://github.com/vanshkoul16/Child-Safety-App"
    echo After signing in to Vercel with GitHub, simply click "Deploy"!
    echo.
    pause
    exit /b
)

if "%choice%"=="2" (
    echo.
    echo [SafeHaven] Running Vercel CLI deployment...
    cmd.exe /c "npx vercel"
    echo.
    pause
    exit /b
)

pause
