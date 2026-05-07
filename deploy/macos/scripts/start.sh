#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ -f "$APP_DIR/config/macos.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/config/macos.env"
  set +a
fi

: "${HOST:=0.0.0.0}"
: "${PORT:=5832}"
: "${PORT_RETRY_LIMIT:=20}"
: "${DATA_DIR:=./data}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 18 or later." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install npm, then run this script again." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18 or later is required. Current version: $(node -v)." >&2
  exit 1
fi

mkdir -p "$DATA_DIR/files" "$DATA_DIR/temp" "$DATA_DIR/peer-files" "$APP_DIR/logs"

if [ ! -d "$APP_DIR/node_modules" ]; then
  npm ci --omit=dev --no-audit --no-fund
fi

if [ "${1:-}" = "--foreground" ]; then
  exec node "$APP_DIR/server.js"
fi

LOG_FILE="$APP_DIR/logs/server.log"
echo "[$(date -Iseconds)] starting web-share on port $PORT" >>"$LOG_FILE"
nohup node "$APP_DIR/server.js" >>"$LOG_FILE" 2>&1 &
echo $! >"$APP_DIR/logs/server.pid"
echo "web-share started in background. Log: $LOG_FILE"
