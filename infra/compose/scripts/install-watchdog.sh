#!/usr/bin/env bash
# One-shot installer for the vendo-prod watchdog timer. Run on the
# host (not inside any container). Idempotent — re-running upgrades the
# unit files in place and reloads systemd.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SYSTEMD_DIR=/etc/systemd/system

# 1. Make sure the watchdog script is executable.
chmod +x "$DIR/watchdog.sh"

# 2. Install systemd unit + timer.
install -m 0644 "$DIR/vendo-watchdog.service" "$SYSTEMD_DIR/vendo-watchdog.service"
install -m 0644 "$DIR/vendo-watchdog.timer"   "$SYSTEMD_DIR/vendo-watchdog.timer"

# 3. Reload + enable + start.
systemctl daemon-reload
systemctl enable --now vendo-watchdog.timer

# 4. Status snapshot for the operator.
systemctl status vendo-watchdog.timer --no-pager || true
echo
echo "Recent watchdog log:"
ls -la /var/log/vendo-watchdog.log 2>/dev/null || echo "  (no log yet — first run is in <60s)"
echo
echo "Tail with: journalctl -u vendo-watchdog.service -f"
echo "Disable  : systemctl disable --now vendo-watchdog.timer"
