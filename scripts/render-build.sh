#!/usr/bin/env bash
set -euo pipefail

echo "▶ Starting Render build"

if [ ! -f package-lock.json ]; then
  echo "⚠️  package-lock.json not found. Generating lockfile with npm install --package-lock-only..."
  npm install --package-lock-only
fi

echo "▶ Installing dependencies with npm ci"
npm ci

echo "▶ Building app"
npm run build

echo "▶ Applying database migrations"
npx drizzle-kit push

echo "✅ Render build completed"

