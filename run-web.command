#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-5173}"

npm -w @geonoise/web run dev &
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
