import asyncio
import json
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

app = FastAPI(title="Bot Gateway", version="0.1.0")

# Serve a minimal web chat demo at /demo
app.mount("/demo", StaticFiles(directory="public", html=True), name="demo")

# ============================================================
# In-memory storage (MVP)
# Replace with DB/Redis for production.
# ============================================================

@dataclass
class BotRecord:
    bot_id: str
    bot_token: str
    user_id: str
    created_at: float


BOTS_BY_ID: Dict[str, BotRecord] = {}
BOTS_BY_TOKEN: Dict[str, BotRecord] = {}

# Active OpenClaw connections per botId
OPENCLAW_WS_BY_BOT: Dict[str, WebSocket] = {}
# Active chat connections per sessionId
CHAT_WS_BY_SESSION: Dict[str, WebSocket] = {}
# Which botId a sessionId is currently bound to
SESSION_TO_BOT: Dict[str, str] = {}


def now_ms() -> int:
    return int(time.time() * 1000)


def _bearer_token(auth_header: Optional[str]) -> Optional[str]:
    if not auth_header:
        return None
    parts = auth_header.split(" ", 1)
    if len(parts) != 2:
        return None
    if parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def require_bot(authorization: Optional[str] = Header(default=None)) -> BotRecord:
    token = _bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    bot = BOTS_BY_TOKEN.get(token)
    if not bot:
        raise HTTPException(status_code=401, detail="Invalid bot token")
    return bot


# ============================================================
# REST: bot issuance (MVP)
# In your product, this should require user auth.
# ============================================================

@app.post("/api/bots")
async def create_bot(payload: Dict[str, Any]):
    user_id = str(payload.get("userId") or "user_anon")
    bot_id = payload.get("botId") or f"bot_{secrets.token_hex(8)}"
    bot_token = f"bot_{secrets.token_urlsafe(24)}"

    rec = BotRecord(bot_id=bot_id, bot_token=bot_token, user_id=user_id, created_at=time.time())
    BOTS_BY_ID[bot_id] = rec
    BOTS_BY_TOKEN[bot_token] = rec

    return {
        "botId": rec.bot_id,
        "botToken": rec.bot_token,
        "wsOpenClawUrl": os.environ.get("OPENCLAW_WS_URL", "/ws/openclaw"),
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "bots": len(BOTS_BY_ID),
        "openclawConnections": len(OPENCLAW_WS_BY_BOT),
        "chatSessions": len(CHAT_WS_BY_SESSION),
        "timestamp": now_ms(),
    }


# ============================================================
# WebSocket: OpenClaw client
# OpenClaw connects here with: Authorization: Bearer <botToken>
# ============================================================

@app.websocket("/ws/openclaw")
async def ws_openclaw(ws: WebSocket):
    await ws.accept()

    auth = ws.headers.get("authorization")
    token = _bearer_token(auth)
    if not token:
        await ws.close(code=4401)
        return

    bot = BOTS_BY_TOKEN.get(token)
    if not bot:
        await ws.close(code=4401)
        return

    # Register connection
    OPENCLAW_WS_BY_BOT[bot.bot_id] = ws

    try:
        # Notify
        await ws.send_text(json.dumps({"type": "server_ready", "botId": bot.bot_id, "ts": now_ms()}))

        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            mtype = msg.get("type")
            if mtype == "hello":
                # optional extra handshake
                continue

            # OpenClaw -> Gateway outbound message
            if mtype in ("outbound_message", "assistant_message"):
                session_id = msg.get("sessionId")
                if not session_id:
                    continue

                chat_ws = CHAT_WS_BY_SESSION.get(session_id)
                if chat_ws:
                    await chat_ws.send_text(
                        json.dumps(
                            {
                                "type": "assistant_message",
                                "botId": bot.bot_id,
                                "sessionId": session_id,
                                "message": msg.get("message") or {},
                                "ts": now_ms(),
                            }
                        )
                    )
                continue

    except WebSocketDisconnect:
        pass
    finally:
        # Cleanup if same socket
        if OPENCLAW_WS_BY_BOT.get(bot.bot_id) is ws:
            OPENCLAW_WS_BY_BOT.pop(bot.bot_id, None)


# ============================================================
# WebSocket: Web chat client (your web page)
# Your web app connects here.
# MVP auth: none. In production: require logged-in user.
# ============================================================

@app.websocket("/ws/chat")
async def ws_chat(ws: WebSocket):
    await ws.accept()

    # MVP: client sends a hello with botId + sessionId
    session_id: Optional[str] = None
    bot_id: Optional[str] = None

    try:
        hello_raw = await ws.receive_text()
        hello = json.loads(hello_raw)
        if hello.get("type") != "hello":
            await ws.close(code=4400)
            return

        session_id = str(hello.get("sessionId") or "")
        bot_id = str(hello.get("botId") or "")
        if not session_id or not bot_id:
            await ws.close(code=4400)
            return

        # Bind
        CHAT_WS_BY_SESSION[session_id] = ws
        SESSION_TO_BOT[session_id] = bot_id

        await ws.send_text(json.dumps({"type": "server_ready", "sessionId": session_id, "botId": bot_id, "ts": now_ms()}))

        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if msg.get("type") != "user_message":
                continue

            text = (msg.get("text") or "").strip()
            if not text:
                continue

            # Route to OpenClaw
            openclaw_ws = OPENCLAW_WS_BY_BOT.get(bot_id)
            if not openclaw_ws:
                await ws.send_text(json.dumps({"type": "error", "code": "OPENCLAW_OFFLINE", "message": "OpenClaw is offline", "ts": now_ms()}))
                continue

            inbound_event = {
                "eventId": msg.get("messageId") or f"evt_{secrets.token_hex(8)}",
                "eventType": "message",
                "timestamp": now_ms(),
                "botId": bot_id,
                "sessionId": session_id,
                "sender": {
                    "id": str(msg.get("senderId") or "web-user"),
                    "username": msg.get("username"),
                    "displayName": msg.get("displayName"),
                },
                "conversation": {
                    "id": session_id,
                    "type": "dm",
                    "isPublic": False,
                },
                "message": {
                    "id": msg.get("messageId") or f"msg_{secrets.token_hex(8)}",
                    "text": text,
                    "attachments": [],
                },
                "raw": {"source": "web"},
            }

            await openclaw_ws.send_text(json.dumps(inbound_event))

    except WebSocketDisconnect:
        pass
    finally:
        if session_id and CHAT_WS_BY_SESSION.get(session_id) is ws:
            CHAT_WS_BY_SESSION.pop(session_id, None)
        if session_id:
            SESSION_TO_BOT.pop(session_id, None)


# ============================================================
# HTTP fallback for OpenClaw send.ts (optional)
# If you keep plugin sendMessage() doing HTTP, you can implement this.
# ============================================================

@app.post("/api/v1/messages")
async def http_send_message(bot: BotRecord = Depends(require_bot), payload: Dict[str, Any] = None):
    payload = payload or {}
    conversation_id = str(payload.get("conversationId") or "")
    text = str(payload.get("text") or "")
    if not conversation_id:
        return JSONResponse({"error": "conversationId required"}, status_code=400)

    chat_ws = CHAT_WS_BY_SESSION.get(conversation_id)
    if chat_ws:
        await chat_ws.send_text(
            json.dumps(
                {
                    "type": "assistant_message",
                    "botId": bot.bot_id,
                    "sessionId": conversation_id,
                    "message": {"id": payload.get("messageId") or f"msg_{secrets.token_hex(8)}", "text": text},
                    "ts": now_ms(),
                }
            )
        )

    return {"messageId": payload.get("messageId") or f"msg_{secrets.token_hex(8)}"}
