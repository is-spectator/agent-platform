#!/usr/bin/env bash
set -euo pipefail

# =============================================================
# install_server.sh
#
# Install + run the Bot Gateway on a SERVER.
#
# This script is designed for Alibaba Cloud Linux (dnf).
# It installs Python 3.11, creates a venv, installs deps,
# and starts uvicorn in the background.
# =============================================================

# ====== USER FILL (server owner) ======
PUBLIC_IP="47.90.246.218"
PORT="8081"
# =====================================

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${ROOT_DIR}/server/bot-gateway"

if [[ ! -d "$APP_DIR" ]]; then
  echo "ERROR: bot-gateway directory not found: $APP_DIR"
  echo "Run this script from the agent-platform root directory."
  exit 1
fi

echo "[1/6] Install python3.11 (dnf)"
sudo -n dnf -y install python3.11 python3.11-pip python3.11-devel

echo "[2/6] Create venv + install deps"
cd "$APP_DIR"
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt

echo "[3/6] Stop existing gateway process (if any)"
if [[ -f bot-gateway.pid ]]; then
  oldpid="$(cat bot-gateway.pid || true)"
  if [[ -n "${oldpid}" ]] && kill -0 "${oldpid}" 2>/dev/null; then
    echo "Stopping old pid: ${oldpid}"
    kill "${oldpid}" || true
    sleep 1
  fi
fi

# Kill any uvicorn that matches this app/port (best effort)
pgrep -f "uvicorn app:app.*--port ${PORT}" >/dev/null 2>&1 && pkill -f "uvicorn app:app.*--port ${PORT}" || true

echo "[4/6] Start gateway (background)"
nohup .venv/bin/uvicorn app:app --host 0.0.0.0 --port "${PORT}" > gateway.log 2>&1 &
echo $! > bot-gateway.pid

echo "[5/6] Health check"
sleep 1
curl -sS "http://127.0.0.1:${PORT}/api/health" || true

echo "[6/6] Done"
echo "Web demo:   http://${PUBLIC_IP}:${PORT}/demo/chat.html"
echo "Create bot: curl -X POST http://${PUBLIC_IP}:${PORT}/api/bots -H 'Content-Type: application/json' -d '{\"userId\":\"user_1\"}'"
