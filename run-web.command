#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-5173}"

# ============================================================================
# PROBE DEBUG NOTES (Jan 2026)
# ============================================================================
# If probe spectrum isn't updating dynamically, check browser console for:
#   [Main] requestLiveProbeUpdates called, liveIds: [...]
#   [Main] sendProbeRequest called for probe: pr1 position: {...}
#   [ProbeWorker] Received message: CALCULATE_PROBE pr1
#   [Main] handleProbeResult received: pr1 magnitudes: ...
#
# If logs don't appear → message flow is broken
# If positions change but magnitudes stay same → worker calculation issue
#
# STALE CACHE FIX: If app appears broken after code changes:
#   1. Kill stale processes: lsof -ti:5173 | xargs kill -9
#   2. Force rebuild: npx tsc -b --force packages/shared packages/core \
#      packages/geo packages/engine packages/engine-backends \
#      packages/engine-webgpu apps/web
#   3. Restart this script
# ============================================================================

# Kill any stale server on this port before starting
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true

# ============================================================================
# BUILD INTEGRITY CHECK
# ============================================================================
# Ensure critical compiled files exist before starting the dev server.
# This prevents 404 errors when TypeScript build is stale or incomplete.

CRITICAL_FILES=(
  "apps/web/dist/main.js"
  "apps/web/dist/probeWorker.js"
  "packages/core/dist/index.js"
  "packages/engine/dist/index.js"
  "packages/shared/dist/index.js"
)

REBUILD_NEEDED=false

for file in "${CRITICAL_FILES[@]}"; do
  if [[ ! -f "$ROOT_DIR/$file" ]]; then
    echo "⚠️  Missing: $file"
    REBUILD_NEEDED=true
  fi
done

# Also check if source is newer than dist (stale build detection)
if [[ -f "$ROOT_DIR/apps/web/src/main.ts" && -f "$ROOT_DIR/apps/web/dist/main.js" ]]; then
  if [[ "$ROOT_DIR/apps/web/src/main.ts" -nt "$ROOT_DIR/apps/web/dist/main.js" ]]; then
    echo "⚠️  Source newer than build: apps/web/src/main.ts"
    REBUILD_NEEDED=true
  fi
fi

if [[ "$REBUILD_NEEDED" == true ]]; then
  echo ""
  echo "🔧 Build is stale or incomplete. Running clean build..."
  echo ""

  # Use npm run build:clean which clears Turbo cache + tsbuildinfo + force rebuilds
  npm run build:clean

  echo ""
  echo "✅ Rebuild complete!"
  echo ""
fi

npm run dev &
DEV_PID=$!

cleanup() {
  kill "$DEV_PID" 2>/dev/null || true
}
trap cleanup INT TERM

if command -v nc >/dev/null; then
  for _ in {1..25}; do
    if nc -z localhost "$PORT"; then
      break
    fi
    sleep 0.2
  done
else
  sleep 1
fi

open "http://localhost:${PORT}"
wait "$DEV_PID"
