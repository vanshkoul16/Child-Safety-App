@echo off
title Setup SafeHaven 24/7 Windows Auto-Start
color 0B
echo ========================================================
echo   Configuring SafeHaven to Run 24/7 on Windows Startup
echo ========================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_VBS=%SCRIPT_DIR%RUN_BACKGROUND_24_7.vbs"

echo Creating Windows Startup Shortcut...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut(\"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\SafeHaven24x7.lnk\"); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET_VBS%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Save()"

if exist "%STARTUP_FOLDER%\SafeHaven24x7.lnk" (
    echo.
    echo [SUCCESS] SafeHaven will now automatically launch 24/7 in the background whenever Windows starts!
    echo Location: "%STARTUP_FOLDER%\SafeHaven24x7.lnk"
) else (
    echo.
    echo [ERROR] Could not create startup shortcut. Please run as Administrator if required.
)

echo.
pause
