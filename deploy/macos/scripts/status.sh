#!/usr/bin/env bash
set -euo pipefail

LABEL="${LABEL:-com.linshare.web-share}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UID_VALUE="$(id -u)"

launchctl print "gui/${UID_VALUE}/${LABEL}" 2>/dev/null | sed -n '1,30p' || true

if [ -f "$APP_DIR/config/macos.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/config/macos.env"
  set +a
fi

: "${PORT:=5832}"
if command -v curl >/dev/null 2>&1; then
  echo
  curl -fsS -o /dev/null -w "http://127.0.0.1:${PORT}/ => %{http_code}\n" "http://127.0.0.1:${PORT}/" || true
fi
