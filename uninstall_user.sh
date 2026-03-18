#!/usr/bin/env bash
set -euo pipefail

# =============================================================
# uninstall_user.sh
#
# Remove the custom channel plugin from a USER machine.
# It will:
# - delete ~/.openclaw/extensions/custom-channel
# - remove channels.custom from ~/.openclaw/config.json
# - remove bindings entries that match (channel=custom)
# - restart OpenClaw gateway
#
# Requirements: jq, openclaw
# =============================================================

CFG="${HOME}/.openclaw/config.json"
EXT_DIR="${HOME}/.openclaw/extensions/custom-channel"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1"; exit 1; }; }

need jq
need openclaw

if [[ ! -f "$CFG" ]]; then
  echo "No config found at $CFG, nothing to do."
else
  echo "[1/4] Update OpenClaw config: remove channels.custom and bindings(match.channel=custom)"
  tmp="$(mktemp)"
  jq '
    .channels = (.channels // {}) |
    .channels |= with_entries(select(.key != "custom")) |
    .bindings = (.bindings // []) |
    .bindings |= [ .[] | select((.match.channel // "") != "custom") ]
  ' "$CFG" > "$tmp"
  mv "$tmp" "$CFG"
fi

echo "[2/4] Remove plugin directory: $EXT_DIR"
rm -rf "$EXT_DIR" || true

echo "[3/4] Restart OpenClaw gateway"
openclaw gateway restart || true

echo "[4/4] Done"
