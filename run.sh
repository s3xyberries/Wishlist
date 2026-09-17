#!/usr/bin/env bash
# Pricekeep launcher for macOS/Linux (parity with run.bat).
set -euo pipefail
cd "$(dirname "$0")"

echo
echo " Pricekeep launcher"
echo " =================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on PATH. Install Node.js 20+ then try again."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found on PATH."
  exit 1
fi

echo "Node $(node -v)"

if [[ ! -d node_modules ]]; then
  echo
  echo "node_modules missing — running npm install..."
  npm install
fi

if [[ ! -d .next ]]; then
  echo
  echo "No production build yet — running npm run build..."
  npm run build
fi

echo
echo "Starting Pricekeep at http://127.0.0.1:43127"
echo "Keep this terminal open while you use the app. Ctrl+C to stop."
echo

(
  sleep 4
  if command -v open >/dev/null 2>&1; then
    open "http://127.0.0.1:43127/"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:43127/" >/dev/null 2>&1 || true
  fi
) &

npm start
