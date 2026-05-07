#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-web-share}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this script as root: sudo ./scripts/install-systemd.sh" >&2
  exit 1
fi

if [ -z "$NODE_BIN" ]; then
  echo "Node.js was not found. Install Node.js 18 or later first." >&2
  exit 1
fi

chmod +x "$APP_DIR/start.sh" "$APP_DIR"/scripts/*.sh
mkdir -p "$APP_DIR/data" "$APP_DIR/logs"

cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<SERVICE
[Unit]
Description=LinShare web file sharing service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=-${APP_DIR}/config/linux.env
ExecStart=${NODE_BIN} ${APP_DIR}/server.js
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SERVICE

cd "$APP_DIR"
if [ ! -d "$APP_DIR/node_modules" ]; then
  npm ci --omit=dev --no-audit --no-fund
fi

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service" >/dev/null
systemctl restart "${SERVICE_NAME}.service"

if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --add-service=http --permanent >/dev/null || true
  firewall-cmd --reload >/dev/null || true
fi

echo "Installed and started ${SERVICE_NAME}.service"
systemctl --no-pager --full status "${SERVICE_NAME}.service" | sed -n '1,18p'
