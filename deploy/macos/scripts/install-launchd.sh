#!/usr/bin/env bash
set -euo pipefail

LABEL="${LABEL:-com.linshare.web-share}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/${LABEL}.plist"
UID_VALUE="$(id -u)"

mkdir -p "$PLIST_DIR" "$APP_DIR/logs"
chmod +x "$APP_DIR/start.command" "$APP_DIR"/scripts/*.sh

cat >"$PLIST_FILE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${APP_DIR}/scripts/start.sh</string>
    <string>--foreground</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${APP_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${APP_DIR}/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${APP_DIR}/logs/launchd.err.log</string>
</dict>
</plist>
PLIST

if launchctl print "gui/${UID_VALUE}/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/${UID_VALUE}" "$PLIST_FILE" >/dev/null 2>&1 || true
fi

launchctl bootstrap "gui/${UID_VALUE}" "$PLIST_FILE"
launchctl enable "gui/${UID_VALUE}/${LABEL}"
launchctl kickstart -k "gui/${UID_VALUE}/${LABEL}"
echo "Installed and started LaunchAgent: ${LABEL}"
