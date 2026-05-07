#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-web-share}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  systemctl --no-pager --full status "${SERVICE_NAME}.service" | sed -n '1,22p' || true
fi

if [ -f "$APP_DIR/config/linux.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/config/linux.env"
  set +a
fi

: "${PORT:=5832}"
if command -v curl >/dev/null 2>&1; then
  echo
  curl -fsS -o /dev/null -w "http://127.0.0.1:${PORT}/ => %{http_code}\n" "http://127.0.0.1:${PORT}/" || true
fi
