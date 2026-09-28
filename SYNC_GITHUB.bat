@echo off
setlocal
cd /d "%~dp0"

echo [SafeHaven] Checking git status...
git status -s

echo.
set /p commit_msg="Enter commit message (leave blank for default auto-save): "
if "%commit_msg%"=="" set commit_msg=Update project files: %date% %time%

echo.
echo [SafeHaven] Staging changes...
git add .

echo [SafeHaven] Committing: %commit_msg%
git commit -m "%commit_msg%"

echo [SafeHaven] Pushing to GitHub (origin/main)...
git push origin main

echo.
echo [SafeHaven] Sync complete!
pause
