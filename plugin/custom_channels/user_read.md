# 用户使用说明（User Guide）— Custom Channel + Bot Gateway

这份文档面向 **最终用户**：你在网页后台创建 Bot，拿到 `botId` + `botToken` 后，把它绑定到你本机的 OpenClaw，即可在网页对话框中与本机 OpenClaw 交互（支持多会话）。

---

## 一、你会得到什么

- 一个 `botId`
- 一个 `botToken`（非常重要，相当于密码）

> 备注：你的本机 OpenClaw 会使用 `botToken` 主动连接云端 Bot Gateway（出站 WebSocket），因此即使你在家宽/NAT 环境也能使用。

---

## 二、前置条件

你的电脑需要：

1) **Node.js 18+**（建议 20+）
2) 已安装 **OpenClaw**（能运行 `openclaw gateway ...`）
3) 安装 `jq`（用于自动写入 OpenClaw 配置）

如果缺 `jq`：
- Ubuntu/Debian：`sudo apt-get update && sudo apt-get install -y jq`
- macOS：`brew install jq`

---

## 三、一键安装（推荐）

### 1）准备 3 个环境变量

把下面三行替换成你自己的值：

```bash
export BOT_ID="bot_..."
export BOT_TOKEN="bot_..."
export AGENT_ID="my-assistant"   # 你本机 OpenClaw 的 agentId
```

> `AGENT_ID` 在你本机 `~/.openclaw/config.json` 的 `agents.list[].id` 里能看到。

### 2）下载并运行安装脚本

把下面脚本保存为 `install-custom-channel.sh` 然后执行：

```bash
bash install-custom-channel.sh
```

脚本内容如下（HTTPS clone 版本）：

```bash
#!/usr/bin/env bash
set -euo pipefail

# ====== 云端 Bot Gateway（固定） ======
GATEWAY_BASE_URL="http://47.90.246.218:8081"
OPENCLAW_WS_URL="ws://47.90.246.218:8081/ws/openclaw"

# ====== 必填：bot 信息 & 目标 agentId ======
: "${BOT_ID:?Please set BOT_ID}"
: "${BOT_TOKEN:?Please set BOT_TOKEN}"
: "${AGENT_ID:?Please set AGENT_ID (the OpenClaw agentId to bind)}"

# ====== 源码仓库（HTTPS） ======
REPO_HTTPS="https://github.com/is-spectator/custom_channels.git"
BRANCH="codex/agent-platform-phase2"

WORKDIR="${HOME}/.openclaw/tmp/custom-channel-install"
EXT_DIR="${HOME}/.openclaw/extensions/custom-channel"
CFG="${HOME}/.openclaw/config.json"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1"; exit 1; }; }

need git
need node
need npm
need openclaw

if ! command -v jq >/dev/null 2>&1; then
  echo "Missing: jq"
  echo "Please install jq first."
  exit 1
fi

mkdir -p "$(dirname "$CFG")"
if [ ! -f "$CFG" ]; then
  echo "{}" > "$CFG"
fi

echo "[1/6] Prepare workdir: ${WORKDIR}"
rm -rf "${WORKDIR}"
mkdir -p "${WORKDIR}"

echo "[2/6] Clone repo + checkout branch"
git clone "${REPO_HTTPS}" "${WORKDIR}"
cd "${WORKDIR}"
git checkout "${BRANCH}"

echo "[3/6] Build plugin"
npm install
npm run build

echo "[4/6] Install plugin to OpenClaw extensions: ${EXT_DIR}"
rm -rf "${EXT_DIR}"
mkdir -p "${EXT_DIR}"
cp -r dist "${EXT_DIR}/"
cp -r openclaw.plugin.json package.json README.md "${EXT_DIR}/"

echo "[5/6] Merge OpenClaw config: ${CFG}"
tmp="$(mktemp)"

jq \
  --arg agentId "${AGENT_ID}" \
  --arg botId "${BOT_ID}" \
  --arg botToken "${BOT_TOKEN}" \
  --arg apiBaseUrl "${GATEWAY_BASE_URL}" \
  --arg wsUrl "${OPENCLAW_WS_URL}" \
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

echo "[6/6] Restart OpenClaw gateway"
openclaw gateway restart || openclaw gateway start

echo
echo "Done."
echo "Bot Gateway: ${GATEWAY_BASE_URL}"
echo "OpenClaw WS: ${OPENCLAW_WS_URL}"
echo
echo "Open the web demo:"
echo "  http://47.90.246.218:8081/demo/chat.html"
echo "Use botId=${BOT_ID}"
```

---

## 四、验证是否成功

1) 打开网页对话框 demo：

- http://47.90.246.218:8081/demo/chat.html

2) 填入你的 `botId`，点击 Connect

3) 发送消息，如果你的本机 OpenClaw 已在线，会收到回复。

如果提示 `OPENCLAW_OFFLINE`：
- 检查你本机是否已启动 `openclaw gateway`
- 检查你本机网络能否连接 `ws://47.90.246.218:8081/ws/openclaw`

---

## 五、安全提示（必读）

- `botToken` 等同密码，不要发到群里/工单里
- 生产环境请使用 **HTTPS/WSS**（当前示例是 MVP）
- 建议对 botToken 做过期与轮换

