#!/usr/bin/env bash
set -euo pipefail

# =============================================================
# install_user.sh
#
# Install + configure the OpenClaw custom channel plugin on a USER machine.
#
# What it does:
# - HTTPS clone the plugin repo
# - npm install + build
# - install into ~/.openclaw/extensions/custom-channel
# - merge ~/.openclaw/config.json (channels.custom + bindings)
# - restart OpenClaw gateway
#
# Requirements on user machine:
# - node >= 18
# - npm
# - git
# - jq
# - openclaw installed
# =============================================================

# ====== USER FILL (end user) ======
BOT_ID="bot_xxx"
BOT_TOKEN="bot_xxx_token"
AGENT_ID="my-assistant"
# ==================================

# ====== SERVER (your cloud) ======
GATEWAY_BASE_URL="http://47.90.246.218:8081"
OPENCLAW_WS_URL="ws://47.90.246.218:8081/ws/openclaw"
# =================================

REPO_HTTPS="https://github.com/is-spectator/agent-platform.git"
BRANCH="main"

WORKDIR="${HOME}/.openclaw/tmp/agent-platform-install"
PLUGIN_DIR_REL="plugin/custom_channels"
EXT_DIR="${HOME}/.openclaw/extensions/custom-channel"
CFG="${HOME}/.openclaw/config.json"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1"; exit 1; }; }

need git
need node
need npm
need openclaw
need jq

if [[ "$BOT_ID" == "bot_xxx" || -z "$BOT_ID" ]]; then
  echo "ERROR: Please edit install_user.sh and set BOT_ID"
  exit 1
fi
if [[ "$BOT_TOKEN" == "bot_xxx_token" || -z "$BOT_TOKEN" ]]; then
  echo "ERROR: Please edit install_user.sh and set BOT_TOKEN"
  exit 1
fi
if [[ "$AGENT_ID" == "my-assistant" || -z "$AGENT_ID" ]]; then
  echo "ERROR: Please edit install_user.sh and set AGENT_ID"
  exit 1
fi

mkdir -p "$(dirname "$CFG")"
if [[ ! -f "$CFG" ]]; then
  echo "{}" > "$CFG"
fi

echo "[1/7] Clone agent-platform repo (HTTPS)"
rm -rf "$WORKDIR"
mkdir -p "$(dirname "$WORKDIR")"
git clone "$REPO_HTTPS" "$WORKDIR"
cd "$WORKDIR"
git checkout "$BRANCH"

echo "[2/7] Build plugin"
cd "$WORKDIR/$PLUGIN_DIR_REL"
npm install
npm run build

echo "[3/7] Install plugin to: $EXT_DIR"
rm -rf "$EXT_DIR"
mkdir -p "$EXT_DIR"
cp -r dist "$EXT_DIR/"
cp -r openclaw.plugin.json package.json README.md user_read.md "$EXT_DIR/"

echo "[4/7] Merge OpenClaw config: $CFG"
tmp="$(mktemp)"

jq \
  --arg agentId "$AGENT_ID" \
  --arg botId "$BOT_ID" \
  --arg botToken "$BOT_TOKEN" \
  --arg apiBaseUrl "$GATEWAY_BASE_URL" \
  --arg wsUrl "$OPENCLAW_WS_URL" \
  '
  .channels = (.channels // {}) |
  .channels.custom = {
    enabled: true,
    transport: "websocket",
    websocketUrl: $wsUrl,
    dmPolicy: "pairing",
    groupPolicy: "disabled",
    accounts: {
      main: {
        label: "main",
        botId: $botId,
        apiBaseUrl: $apiBaseUrl,
        apiToken: $botToken
      }
    }
  } |
  .bindings = (.bindings // []) |
  .bindings = ([.bindings[] | select(.match.channel != "custom" or (.match.accountId // "") != "main" or .agentId != $agentId)] + [
    { agentId: $agentId, match: { channel: "custom", accountId: "main" } }
  ])
  ' "$CFG" > "$tmp"

mv "$tmp" "$CFG"

echo "[5/7] Restart OpenClaw gateway"
openclaw gateway restart || openclaw gateway start

echo "[6/7] Done"
echo "Gateway base: ${GATEWAY_BASE_URL}"
echo "OpenClaw WS:   ${OPENCLAW_WS_URL}"
echo "botId:        ${BOT_ID}"

echo "[7/7] Test"
echo "Open web demo: http://47.90.246.218:8081/demo/chat.html"
