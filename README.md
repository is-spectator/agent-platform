# Agent Platform (Bot Gateway + OpenClaw Custom Channel)

这份目录是按 **部署角色** 拆分的：

- `server/`：部署在云服务器上的 **Bot Gateway**（中转服务）
- `plugin/`：部署在用户本机 OpenClaw 上的 **Custom Channel 插件**

目标：让用户在你的 Web 对话框里与 **自己本机的 OpenClaw** 交互（多会话），并且支持家宽/NAT（通过出站 WebSocket）。

---

## 目录结构

- `server/bot-gateway/`
  - Python FastAPI + WebSocket relay
  - Web demo: `/demo/chat.html`
  - 监听端口：8081

- `plugin/custom_channels/`
  - OpenClaw channel plugin（custom）
  - 分支：`codex/agent-platform-phase2`
  - 用户安装说明：`user_read.md`

---

## 云服务器部署（server）

推荐直接运行：

```bash
bash install_server.sh
```

进入目录：

```bash
cd server/bot-gateway
```

按 `server/bot-gateway/README.md` 启动：

```bash
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8081
```

健康检查：

```bash
curl http://<public-ip>:8081/api/health
```

Web demo：

- `http://<public-ip>:8081/demo/chat.html`

---

## 用户本机安装（plugin）

推荐直接运行：

```bash
bash install_user.sh
```

（注意先编辑脚本顶部的 BOT_ID/BOT_TOKEN/AGENT_ID）

卸载：

```bash
bash uninstall_user.sh
```

进入目录：

```bash
cd plugin/custom_channels
```

请直接按：

- `plugin/custom_channels/user_read.md`

用户将通过 HTTPS clone + 自动写入 `~/.openclaw/config.json` 的方式安装。

---

## 端口/安全组

服务器至少放行：
- TCP 8081（Bot Gateway HTTP + WS）

生产环境建议：
- 改为 HTTPS/WSS（加域名 + 证书）
- botToken 过期/轮换
- `/api/bots` 接入你的用户鉴权
