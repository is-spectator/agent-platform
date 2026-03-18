import type {
  MessageContent,
  MessageTarget,
  ResolvedAccount,
} from "./types.js";
import { hasBotGatewaySendFn, sendOutboundToGateway } from "./ws-session.js";

/**
 * Send an outbound message to your platform's API.
 *
 * Adapt the HTTP request to match your product's messaging API.
 */
export async function sendMessage(
  account: ResolvedAccount,
  target: MessageTarget,
  content: MessageContent
): Promise<{ messageId: string }> {
  const messageId = `msg_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

  // Prefer Bot Gateway WebSocket when available (real-time, NAT-friendly).
  if (hasBotGatewaySendFn()) {
    sendOutboundToGateway(account.accountId, target, content, messageId);
    return { messageId };
  }

  // Fallback: HTTP relay (useful for deployments that don't keep WS open).
  const url = new URL("/api/v1/messages", account.config.apiBaseUrl);

  const body: Record<string, unknown> = {
    conversationId: target.conversationId,
    text: content.text,
    parseMode: content.parseMode ?? "plain",
  };

  if (target.replyToMessageId) {
    body.replyToMessageId = target.replyToMessageId;
  }

  if (target.threadId) {
    body.threadId = target.threadId;
  }

  if (content.media && content.media.length > 0) {
    body.attachments = content.media.map((m) => ({
      type: m.type,
      url: m.url,
      fileName: m.fileName,
      mimeType: m.mimeType,
      caption: m.caption,
    }));
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.config.apiToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `[mars] Failed to send message: HTTP ${res.status} — ${text}`
    );
  }

  const data = (await res.json()) as { messageId: string };
  return { messageId: data.messageId };
}

/**
 * Edit an already-sent message (for streaming / progressive updates).
 */
export async function editMessage(
  account: ResolvedAccount,
  messageId: string,
  content: Pick<MessageContent, "text" | "parseMode">
): Promise<void> {
  const url = new URL(
    `/api/v1/messages/${encodeURIComponent(messageId)}`,
    account.config.apiBaseUrl
  );

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.config.apiToken}`,
    },
    body: JSON.stringify({
      text: content.text,
      parseMode: content.parseMode ?? "plain",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `[mars] Failed to edit message ${messageId}: HTTP ${res.status} — ${text}`
    );
  }
}
