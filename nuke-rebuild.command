#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo ""
echo "☢️  NUCLEAR REBUILD - GeoNoise"
echo "================================"
echo ""

# Kill any running dev servers
echo "🔪 Killing any running dev servers..."
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true

# Stop turbo daemon
echo "🛑 Stopping Turbo daemon..."
npx turbo daemon stop 2>/dev/null || true

# Remove all build artifacts
echo "🗑️  Removing all build artifacts..."
rm -rf packages/*/dist
rm -rf apps/*/dist
rm -rf packages/*/*.tsbuildinfo
rm -rf apps/*/*.tsbuildinfo
rm -rf packages/*/tsconfig.tsbuildinfo
rm -rf apps/*/tsconfig.tsbuildinfo
rm -rf node_modules/.turbo
rm -rf .turbo
rm -rf ~/Library/Caches/turbo

echo "✅ All caches and build artifacts removed"
echo ""

# Rebuild everything
echo "🔨 Rebuilding all packages..."
echo ""
npm run build

echo ""
echo "================================"
echo "✅ NUCLEAR REBUILD COMPLETE"
echo "================================"
echo ""
echo "You can now run: npm run dev"
echo "Or double-click: run-web.command"
echo ""

# Keep terminal open to see results
read -s -k "?Press any key to close..."
