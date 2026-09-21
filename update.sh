#!/usr/bin/env bash
# Pricekeep Update & Run for macOS/Linux (parity with update.bat).
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)"

echo
echo " Pricekeep -- Update & Run"
echo " ========================="
echo " Project: $PWD"
echo

if ! command -v git >/dev/null 2>&1; then
  echo "Git was not found on PATH."
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on PATH. Install Node.js 20+ then try again."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found on PATH."
  exit 1
fi

if [[ ! -f package.json ]]; then
  echo "package.json not found in $PWD."
  exit 1
fi
if [[ ! -d .git ]]; then
  echo "Not a Git checkout. Clone https://github.com/s3xyberries/Wishlist first."
  exit 1
fi

echo "Node $(node -v)"
echo "$(git --version)"
echo

if [[ -f package-lock.json ]]; then
  echo "Resetting package-lock.json to match the last commit..."
  git checkout -- package-lock.json || true
fi

echo
echo "Pulling latest from Git..."
git pull

echo
echo "Cleaning build output (.next + caches)..."
npm run clean || rm -rf .next

echo
echo "Installing dependencies (npm install)..."
npm install

echo
echo "Update complete. Starting Pricekeep (forced rebuild)..."
echo
export FORCE_REBUILD=1
exec "$(cd "$(dirname "$0")" && pwd)/run.sh"
