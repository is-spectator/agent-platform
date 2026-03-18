# Bot Gateway (MVP)

Cloud relay for: Web Chat UI ⇄ (WS) ⇄ User's local OpenClaw

## Requirements

- Python 3.11

## Setup

```bash
cd bot-gateway
python3.11 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
. .venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8081
```

## Endpoints

- Health: `GET /api/health`
- Create bot (MVP): `POST /api/bots` body: `{ "userId": "user_1" }`
- OpenClaw WS: `ws(s)://<host>:8081/ws/openclaw` (Authorization: Bearer <botToken>)
- Web chat WS: `ws(s)://<host>:8081/ws/chat`

## Web chat protocol (MVP)

1) client connects to `/ws/chat`
2) send hello:

```json
{ "type": "hello", "botId": "bot_...", "sessionId": "sess_..." }
```

3) send user message:

```json
{ "type": "user_message", "messageId": "m1", "text": "hi" }
```

Server will push:

```json
{ "type": "assistant_message", "sessionId": "sess_...", "message": {"text": "..."} }
```
