import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  type ChannelHandlers,
  type CustomChannelConfig,
  type RawInboundEvent,
  RawInboundEventSchema,
  CustomChannelConfigSchema,
} from "./types.js";
import { resolveAccounts, type probeAccount } from "./accounts.js";
import { evaluateAccess } from "./access.js";
import { buildInboundContext } from "./context.js";
import { verifyWebhookSignature } from "./security.js";
import { setBotGatewaySendFn } from "./ws-session.js";

/**
 * Main entry point — start monitoring your custom channel.
 *
 * This follows OpenClaw's standard channel lifecycle:
 *   1. Validate config & resolve accounts
 *   2. Start transport (webhook server / WS / polling)
 *   3. Listen for inbound events
 *   4. Normalize → access check → route to handlers
 *   5. Graceful shutdown via AbortSignal
 */
export async function monitorCustomProvider(
  rawConfig: unknown,
  handlers: ChannelHandlers,
  signal: AbortSignal
): Promise<void> {
  // 1. Validate configuration
  const parsed = CustomChannelConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new Error(
      `[mars] Invalid config: ${parsed.error.message}`
    );
  }
  const config = parsed.data as CustomChannelConfig;

  if (!config.enabled) {
    console.log("[mars] Channel is disabled, skipping.");
    return;
  }

  // 2. Resolve accounts
  const accounts = resolveAccounts(config);
  const primaryAccount = accounts.values().next().value!;

  handlers.onStatusChange?.("connecting");

  // 3. Start the appropriate transport
  switch (config.transport) {
    case "webhook":
      await startWebhookTransport(config, primaryAccount.config.webhookSecret, handlers, signal);
      break;
    case "websocket":
      await startWebSocketTransport(config, handlers, signal);
      break;
    case "polling":
      await startPollingTransport(config, handlers, signal);
      break;
  }
}

// ============================================================
// Webhook Transport
// ============================================================

async function startWebhookTransport(
  config: CustomChannelConfig,
  webhookSecret: string | undefined,
  handlers: ChannelHandlers,
  signal: AbortSignal
): Promise<void> {
  const port = config.webhook?.port ?? 3100;
  const path = config.webhook?.path ?? "/webhook/custom";

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Only accept POST to our path
    if (req.method !== "POST" || req.url !== path) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    try {
      const body = await readBody(req);

      // Verify webhook signature if secret is configured
      if (webhookSecret) {
        const signature = req.headers["x-signature"] as string | undefined;
        if (!signature || !verifyWebhookSignature(body, signature, webhookSecret)) {
          res.writeHead(401);
          res.end("Invalid signature");
          return;
        }
      }

      const event = parseAndValidateEvent(body);
      if (!event) {
        res.writeHead(400);
        res.end("Invalid event payload");
        return;
      }

      // Respond immediately — process async
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));

      await processEvent(event, config, handlers);
    } catch (err) {
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    }
  });

  // Graceful shutdown
  signal.addEventListener("abort", () => {
    server.close();
    handlers.onStatusChange?.("disconnected");
  });

  return new Promise<void>((resolve, reject) => {
    server.listen(port, () => {
      console.log(
        `[mars] Webhook server listening on :${port}${path}`
      );
      handlers.onStatusChange?.("connected");
    });

    server.on("error", (err) => {
      handlers.onError?.(err);
      reject(err);
    });

    server.on("close", () => {
      resolve();
    });
  });
}

// ============================================================
// WebSocket Transport
// ============================================================

async function startWebSocketTransport(
  config: CustomChannelConfig,
  handlers: ChannelHandlers,
  signal: AbortSignal
): Promise<void> {
  const wsUrl = config.websocketUrl;
  if (!wsUrl) {
    throw new Error("[mars] websocketUrl is required for WS transport");
  }

  const accounts = resolveAccounts(config);
  const primaryAccount = accounts.values().next().value!;

  let reconnectAttempt = 0;
  const MAX_RECONNECT = 10;
  const BASE_DELAY_MS = 1000;

  const connect = (): Promise<void> =>
    new Promise<void>((resolve) => {
      const ws = new WebSocket(wsUrl, {
        // @ts-expect-error — Node 21+ WebSocket supports headers
        headers: {
          Authorization: `Bearer ${primaryAccount.config.apiToken}`,
          "X-Bot-Id": primaryAccount.config.botId ?? "",
        },
      });

      ws.addEventListener("open", () => {
        reconnectAttempt = 0;
        handlers.onStatusChange?.("connected");
        console.log("[mars] WebSocket connected");

        // Provide a send function for outbound messages.
        setBotGatewaySendFn((payload) => {
          ws.send(JSON.stringify(payload));
        });

        // Identify this OpenClaw instance + bot to the gateway.
        try {
          ws.send(
            JSON.stringify({
              type: "hello",
              botId: primaryAccount.config.botId,
              timestamp: Date.now(),
            })
          );
        } catch {
          // ignore
        }
      });

      ws.addEventListener("message", async (msgEvent) => {
        try {
          const data =
            typeof msgEvent.data === "string"
              ? msgEvent.data
              : Buffer.from(msgEvent.data as ArrayBuffer).toString("utf-8");

          const event = parseAndValidateEvent(data);
          if (event) {
            await processEvent(event, config, handlers);
          }
        } catch (err) {
          handlers.onError?.(
            err instanceof Error ? err : new Error(String(err))
          );
        }
      });

      ws.addEventListener("close", async () => {
        // Drop outbound channel
        setBotGatewaySendFn(null);
        handlers.onStatusChange?.("reconnecting");
        if (signal.aborted) {
          resolve();
          return;
        }
        if (reconnectAttempt >= MAX_RECONNECT) {
          handlers.onError?.(
            new Error("[mars] Max reconnection attempts reached")
          );
          handlers.onStatusChange?.("error");
          resolve();
          return;
        }

        const delay = BASE_DELAY_MS * 2 ** reconnectAttempt;
        reconnectAttempt++;
        console.log(
          `[mars] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`
        );
        await sleep(delay);
        if (!signal.aborted) {
          connect().then(resolve);
        } else {
          resolve();
        }
      });

      ws.addEventListener("error", (err) => {
        handlers.onError?.(new Error(`WebSocket error: ${String(err)}`));
      });

      signal.addEventListener("abort", () => {
        setBotGatewaySendFn(null);
        ws.close();
        handlers.onStatusChange?.("disconnected");
      });
    });

  await connect();
}

// ============================================================
// Polling Transport
// ============================================================

async function startPollingTransport(
  config: CustomChannelConfig,
  handlers: ChannelHandlers,
  signal: AbortSignal
): Promise<void> {
  const accounts = resolveAccounts(config);
  const primaryAccount = accounts.values().next().value!;
  const intervalMs = config.pollingIntervalMs ?? 3000;

  let cursor: string | undefined;

  handlers.onStatusChange?.("connected");
  console.log(
    `[mars] Polling every ${intervalMs}ms`
  );

  while (!signal.aborted) {
    try {
      const url = new URL("/api/v1/events", primaryAccount.config.apiBaseUrl);
      if (cursor) url.searchParams.set("after", cursor);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${primaryAccount.config.apiToken}`,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`Polling failed: HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        events: unknown[];
        cursor?: string;
      };

      if (data.cursor) cursor = data.cursor;

      for (const rawEvent of data.events) {
        const event = parseAndValidateEvent(JSON.stringify(rawEvent));
        if (event) {
          await processEvent(event, config, handlers);
        }
      }
    } catch (err) {
      if (signal.aborted) break;
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }

    await sleep(intervalMs);
  }

  handlers.onStatusChange?.("disconnected");
}

// ============================================================
// Shared helpers
// ============================================================

async function processEvent(
  event: RawInboundEvent,
  config: CustomChannelConfig,
  handlers: ChannelHandlers
): Promise<void> {
  // Only process new messages for now
  if (event.eventType !== "message") return;

  // Access control
  const access = evaluateAccess(event, config);
  if (!access.allowed) {
    console.log(
      `[mars] Blocked event ${event.eventId}: ${access.reason}`
    );
    return;
  }

  // Normalize to InboundContext
  const context = buildInboundContext(event, {
    isDmAllowed: access.isDmAllowed,
    isGroupAllowed: access.isGroupAllowed,
    requiresMention: access.requiresMention,
  });

  // Route to OpenClaw agent
  await handlers.onMessage(context);
}

function parseAndValidateEvent(raw: string): RawInboundEvent | null {
  try {
    const json = JSON.parse(raw);
    const result = RawInboundEventSchema.safeParse(json);
    if (!result.success) {
      console.warn(
        `[mars] Invalid event: ${result.error.message}`
      );
      return null;
    }
    return result.data as RawInboundEvent;
  } catch {
    console.warn("[mars] Failed to parse event JSON");
    return null;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
