#!/bin/bash
cd "$(dirname "$0")"

echo "🛡️ Guardian active"

while true; do
  ALLOW_RESTART=GUARDIAN node server.js
  EXIT_CODE=$?

  # 🛑 Market closed – intentional exit
  if [ $EXIT_CODE -eq 99 ]; then
    echo "🛑 Market closed. Guardian exiting."
    exit 0
  fi

  # ⏳ Port still busy
  if [ $EXIT_CODE -eq 2 ]; then
    echo "⏳ Port busy. Retrying in 10s..."
    sleep 10
    continue
  fi

  echo "⚠️ Unexpected stop (code $EXIT_CODE). Restarting in 3s..."
  sleep 3
done