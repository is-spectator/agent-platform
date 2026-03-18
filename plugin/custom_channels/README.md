# openclaw-channel-mars (Bot Gateway Edition)

This repo provides a **Mars** plugin for OpenClaw designed for the following product workflow:

1. Your SaaS provides a **web chat UI**.
2. A user creates a **Bot** in your SaaS → gets `botId` + `botToken`.
3. The user binds that `botId/botToken` into **their local OpenClaw**.
4. When the user chats in your web UI, messages are relayed to the user's local OpenClaw via a **cloud Bot Gateway**.

This design works for home broadband / NAT environments because OpenClaw makes an **outbound WebSocket** connection to the gateway.

---

## Components

### 1) Bot Gateway (cloud relay)
A small server that:
- issues bot credentials (`botId`, `botToken`)
- keeps a WebSocket connection from the user's local OpenClaw
- keeps a WebSocket connection from the web chat UI
- relays messages both directions

An MVP implementation is included in this workspace at:

- `~/.openclaw/workspace/bot-gateway`

(If you keep it in a separate repo later, this plugin will still work.)

### 2) This OpenClaw channel plugin
- Transport: **websocket** (recommended)
- Inbound messages arrive from the gateway as JSON events
- Outbound assistant replies are sent back over the **same WebSocket** when available
- HTTP fallback supported via `POST /api/v1/messages` on your gateway

---

## Quick Start (end-to-end on one server)

Assume your server public IP is `47.90.246.218`.

### Step 1 — Run the Bot Gateway (Python)

```bash
cd ~/.openclaw/workspace/bot-gateway
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8081
```

Health:

```bash
curl http://47.90.246.218:8081/api/health
```

### Step 2 — Create a botId + botToken

```bash
curl -X POST http://47.90.246.218:8081/api/bots \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user_1"}'
```

You will get:
- `botId`
- `botToken`

### Step 3 — Configure the user’s local OpenClaw

In `~/.openclaw/config.json` on the user machine:

```jsonc
{
  "channels": {
    "mars": {
      "enabled": true,
      "transport": "websocket",
      "websocketUrl": "ws://47.90.246.218:8081/ws/openclaw",

      "dmPolicy": "pairing",
      "groupPolicy": "disabled",

      "accounts": {
        "main": {
          "label": "main",
          "botId": "<BOT_ID>",
          "apiBaseUrl": "http://47.90.246.218:8081",
          "apiToken": "<BOT_TOKEN>"
        }
      }
    }
  },
  "bindings": [
    {
      "agentId": "my-assistant",
      "match": { "channel": "mars", "accountId": "main" }
    }
  ]
}
```

Then start OpenClaw:

```bash
openclaw gateway
```

### Step 4 — Connect your Web Chat UI

Connect to:

- `ws://47.90.246.218:8081/ws/chat`

Send a hello:

```json
{ "type": "hello", "botId": "<BOT_ID>", "sessionId": "sess_123" }
```

Send a user message:

```json
{ "type": "user_message", "messageId": "m1", "text": "hello" }
```

The gateway will push assistant replies:

```json
{ "type": "assistant_message", "sessionId": "sess_123", "message": {"text": "..."} }
```

---

## Message Routing / Multi-session

- Each web chat session MUST have a stable `sessionId`.
- The gateway uses `sessionId` as the OpenClaw `conversation.id`.
- This allows multiple concurrent sessions per bot.

---

## Security Notes (important)

- For production: use **wss://** and HTTPS.
- Do not pass tokens in query strings.
- The included `POST /api/bots` endpoint is an MVP and MUST be protected by user auth.
- Consider expiring/rotating bot tokens.

---

## Dev

```bash
npm install
npm run typecheck
npm test
npm run build
```
