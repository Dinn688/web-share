#!/usr/bin/env bash
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
"$APP_DIR/scripts/start.sh"
STATUS=$?
exit "$STATUS"
