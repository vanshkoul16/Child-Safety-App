@echo off
title Disable SafeHaven Auto-Start
color 0C
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP_FOLDER%\SafeHaven24x7.lnk" (
    del "%STARTUP_FOLDER%\SafeHaven24x7.lnk"
    echo [SUCCESS] SafeHaven auto-start shortcut removed from Windows Startup.
) else (
    echo [INFO] SafeHaven auto-start shortcut was not found in Startup folder.
)
pause
