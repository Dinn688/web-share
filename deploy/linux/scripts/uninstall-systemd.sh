#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-web-share}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this script as root: sudo ./scripts/uninstall-systemd.sh" >&2
  exit 1
fi

systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
systemctl disable "${SERVICE_NAME}.service" 2>/dev/null || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
echo "Removed ${SERVICE_NAME}.service. Application files and data were not deleted."
