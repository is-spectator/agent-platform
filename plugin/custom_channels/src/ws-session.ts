import type { MessageContent, MessageTarget } from "./types.js";

export type BotGatewaySendFn = (payload: unknown) => void;

let SEND_FN: BotGatewaySendFn | null = null;

/**
 * Provide a send function backed by the active Bot Gateway WebSocket.
 * monitor.ts calls this on connect/disconnect.
 */
export function setBotGatewaySendFn(fn: BotGatewaySendFn | null): void {
  SEND_FN = fn;
}

export function hasBotGatewaySendFn(): boolean {
  return !!SEND_FN;
}

export function sendOutboundToGateway(
  accountId: string,
  target: MessageTarget,
  content: MessageContent,
  messageId: string
): void {
  if (!SEND_FN) throw new Error("[custom-channel] Bot Gateway WS not connected");

  // Map OpenClaw outbound → gateway assistant_message
  const sessionId = target.conversationId;

  SEND_FN({
    type: "assistant_message",
    sessionId,
    accountId,
    message: {
      id: messageId,
      text: content.text,
      parseMode: content.parseMode ?? "plain",
      // TODO: attachments passthrough once gateway supports it
    },
    ts: Date.now(),
  });
}
