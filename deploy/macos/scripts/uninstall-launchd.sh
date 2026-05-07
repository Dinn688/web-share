#!/usr/bin/env bash
set -euo pipefail

LABEL="${LABEL:-com.linshare.web-share}"
PLIST_FILE="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_VALUE="$(id -u)"

launchctl bootout "gui/${UID_VALUE}" "$PLIST_FILE" >/dev/null 2>&1 || true
rm -f "$PLIST_FILE"
echo "Removed LaunchAgent: ${LABEL}"
