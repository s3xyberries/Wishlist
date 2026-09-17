#!/usr/bin/env bash
# Pricekeep launcher for macOS/Linux (parity with run.bat).
# Always runs from this script's directory (safe with spaces in the path).
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)"

echo
echo " Pricekeep launcher"
echo " =================="
echo " Project: $PWD"
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

if [[ ! -f package.json ]]; then
  echo "package.json not found in $PWD. Run this script from inside the Wishlist repo folder."
  exit 1
fi

echo
echo "Ensuring dependencies are installed (npm install)..."
npm install

if [[ ! -f node_modules/better-sqlite3/package.json ]]; then
  echo "better-sqlite3 is missing after npm install. Delete node_modules and retry."
  exit 1
fi

if [[ ! -f .next/BUILD_ID ]]; then
  echo
  echo "Production build missing or incomplete — running npm run build..."
  echo "(uses webpack so better-sqlite3 stays external)"
  rm -rf .next
  npm run build
fi

if [[ ! -f .next/BUILD_ID ]]; then
  echo "Build finished but .next/BUILD_ID is still missing. App was not started."
  exit 1
fi

echo
echo "Build OK. Starting Pricekeep at http://127.0.0.1:43127"
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
