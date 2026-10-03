@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Gijiroku Quest (PMO practice) ===
echo.
where node >nul 2>nul
if errorlevel 1 goto nonode
if exist "node_modules\zod\package.json" if exist "node_modules\@anthropic-ai\sdk\package.json" goto depsok
echo Installing required packages. This is needed only the first time and requires internet.
call npm install
if errorlevel 1 goto npmfail
:depsok
if exist ".env" goto envok
copy ".env.example" ".env" >nul
echo.
echo Created the .env file.
echo To use AI scoring: open .env in Notepad, write your API key after ANTHROPIC_API_KEY= , save, and run start.bat again.
echo You can also play without AI scoring.
echo.
:envok
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:8000"
node server.js
echo.
echo The server has stopped.
pause
exit /b 0
:nonode
echo Node.js was not found.
echo Please install the LTS version from https://nodejs.org and run this file again.
pause
exit /b 1
:npmfail
echo npm install failed. Please check your internet connection and try again.
pause
exit /b 1
