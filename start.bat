@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js が見つかりません。https://nodejs.org から LTS 版をインストールしてください。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 初回セットアップ中です...
  call npm install
)
if not exist .env (
  copy .env.example .env >nul
  echo .env を作成しました。AI採点を使う場合は、メモ帳で ANTHROPIC_API_KEY を書き換えて保存し、もう一度 start.bat を実行してください。
)
start "" http://localhost:8000
node server.js
pause
