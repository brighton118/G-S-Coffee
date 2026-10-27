@echo off
set "PATH=D:\Downloads\G-S-Coffee-main\git\cmd;D:\Downloads\G-S-Coffee-main\nodejs\node-v20.15.0-win-x64;%PATH%"
cd /d "D:\Downloads\G-S-Coffee-main\G-S-Coffee-main"

echo Building production bundle...
call npm.cmd run build
if %errorlevel% neq 0 (
    echo Build failed! Aborting deployment.
    pause
    exit /b %errorlevel%
)

echo Deploying directly to Firebase Hosting...
call npx.cmd firebase deploy --only hosting

echo.
echo ========================================================
echo Deployment Complete!
echo Live Website: https://gs-coffee-3d022.web.app
echo ========================================================
echo.
pause
