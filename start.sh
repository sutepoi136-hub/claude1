#!/usr/bin/env bash
# 起動: bash start.sh   (macOS / Linux)
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Node.js が見つかりません。https://nodejs.org から LTS 版をインストールしてください。"; exit 1; }
[ -d node_modules ] || { echo "初回セットアップ中です..."; npm install || exit 1; }
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env を作成しました。AI採点を使う場合は ANTHROPIC_API_KEY を書き換えて、もう一度実行してください。"
fi
( sleep 1; (open http://localhost:8000 || xdg-open http://localhost:8000) >/dev/null 2>&1 ) &
node server.js
