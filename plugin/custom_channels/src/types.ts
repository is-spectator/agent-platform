import { z } from "zod";

// ============================================================
// OpenClaw Channel Plugin Types
// ============================================================

/**
 * Inbound message context — the standardized envelope that OpenClaw
 * uses across ALL channels. Your channel must transform platform-
 * specific raw messages into this shape.
 */
export interface InboundContext {
  /** Sender identity */
  sender: {
    id: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };

  /** Conversation scope */
  conversationScope: {
    type: "dm" | "group" | "channel" | "thread";
    id: string;
    isPublic: boolean;
    parentId?: string;
  };

  /** Normalized message content */
  messageContent: {
    text: string;
    media?: MediaAttachment[];
    replyToMessageId?: string;
    timestamp: number;
  };

  /** Pass-through for platform-specific data */
  platformMetadata: Record<string, unknown>;

  /** Evaluated access control flags */
  accessControl: {
    isDmAllowed: boolean;
    isGroupAllowed: boolean;
    requiresMention: boolean;
  };
}

export interface MediaAttachment {
  type: "image" | "audio" | "video" | "document" | "sticker";
  url: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
}

/**
 * Target for outbound messages — tells the send layer where to
 * deliver the reply.
 */
export interface MessageTarget {
  conversationId: string;
  replyToMessageId?: string;
  threadId?: string;
}

export interface MessageContent {
  text: string;
  media?: OutboundMedia[];
  parseMode?: "plain" | "markdown" | "html";
}

export interface OutboundMedia {
  type: "image" | "audio" | "video" | "document";
  url?: string;
  buffer?: Buffer;
  fileName?: string;
  mimeType?: string;
  caption?: string;
}

// ============================================================
// Channel Handlers — OpenClaw core calls these
// ============================================================

export interface ChannelHandlers {
  onMessage(context: InboundContext): Promise<void>;
  onError?(error: Error): void;
  onStatusChange?(status: ChannelStatus): void;
}

export type ChannelStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

// ============================================================
// Account configuration
// ============================================================

export interface CustomAccountConfig {
  /** Display label for this account (e.g. "production-bot") */
  label?: string;

  /** Your platform-issued bot id (used for routing). */
  botId?: string;

  /** API base URL of your product (also used as a default to derive websocketUrl if needed). */
  apiBaseUrl: string;

  /** Authentication token / API key (use your botToken here). */
  apiToken: string;

  /** Optional webhook secret for verifying inbound payloads */
  webhookSecret?: string;
}

export interface ResolvedAccount {
  accountId: string;
  config: CustomAccountConfig;
  status: ChannelStatus;
}

// ============================================================
// Channel configuration — mirrors OpenClaw's common schema
// ============================================================

export interface CustomChannelConfig {
  /** Whether the channel is enabled */
  enabled: boolean;

  /** DM access policy */
  dmPolicy: "open" | "pairing" | "allowlist";
  /** Senders allowed via DM (ids or usernames) */
  allowFrom?: string[];

  /** Group access policy */
  groupPolicy: "open" | "allowlist" | "disabled";
  /** Senders allowed in groups */
  groupAllowFrom?: string[];
  /** Per-group overrides */
  groups?: Record<string, GroupConfig>;

  /** Accounts (multi-account support) */
  accounts: Record<string, CustomAccountConfig>;

  /** Transport settings */
  transport: "webhook" | "websocket" | "polling";

  /** Webhook listener settings (when transport = "webhook") */
  webhook?: {
    /** Port for the local HTTP server */
    port: number;
    /** Path prefix, e.g. "/webhook/custom" */
    path: string;
  };

  /** Polling interval in ms (when transport = "polling") */
  pollingIntervalMs?: number;

  /** WebSocket URL (when transport = "websocket") */
  websocketUrl?: string;

  /** Network / proxy */
  network?: {
    proxyUrl?: string;
  };
}

export interface GroupConfig {
  disabled?: boolean;
  allowFrom?: string[];
  requireMention?: boolean;
}

// ============================================================
// Zod schemas for runtime validation
// ============================================================

export const CustomAccountConfigSchema = z.object({
  label: z.string().optional(),
  botId: z.string().min(1).optional(),
  apiBaseUrl: z.string().url(),
  apiToken: z.string().min(1),
  webhookSecret: z.string().optional(),
});

export const GroupConfigSchema = z.object({
  disabled: z.boolean().optional(),
  allowFrom: z.array(z.string()).optional(),
  requireMention: z.boolean().optional(),
});

export const CustomChannelConfigSchema = z.object({
  enabled: z.boolean().default(true),
  dmPolicy: z.enum(["open", "pairing", "allowlist"]).default("pairing"),
  allowFrom: z.array(z.string()).optional(),
  groupPolicy: z.enum(["open", "allowlist", "disabled"]).default("disabled"),
  groupAllowFrom: z.array(z.string()).optional(),
  groups: z.record(z.string(), GroupConfigSchema).optional(),
  accounts: z.record(z.string(), CustomAccountConfigSchema),
  transport: z.enum(["webhook", "websocket", "polling"]).default("webhook"),
  webhook: z
    .object({
      port: z.number().int().min(1).max(65535).default(3100),
      path: z.string().default("/webhook/custom"),
    })
    .optional(),
  pollingIntervalMs: z.number().int().min(1000).default(3000),
  websocketUrl: z.string().url().optional(),
  network: z
    .object({
      proxyUrl: z.string().url().optional(),
    })
    .optional(),
});

// ============================================================
// Raw inbound event — the shape YOUR platform sends
// Customize this to match your product's webhook / WS payload.
// ============================================================

export interface RawInboundEvent {
  /** Unique event id */
  eventId: string;
  /** Event type emitted by your platform */
  eventType: "message" | "message_edit" | "reaction" | "status";
  /** Timestamp (epoch ms) */
  timestamp: number;

  /** Your platform bot id (helps routing/debugging). */
  botId?: string;

  /** Multi-session id coming from your web app (maps to conversation.id). */
  sessionId?: string;

  /** Sender info from your platform */
  sender: {
    id: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };
  /** Conversation / room / chat info */
  conversation: {
    id: string;
    type: "dm" | "group" | "channel" | "thread";
    isPublic?: boolean;
    parentId?: string;
  };
  /** Message payload */
  message: {
    id: string;
    text: string;
    replyToMessageId?: string;
    attachments?: Array<{
      type: string;
      url: string;
      mimeType?: string;
      fileName?: string;
      sizeBytes?: number;
    }>;
  };
  /** Raw platform-specific fields you want to preserve */
  raw?: Record<string, unknown>;
}

export const RawInboundEventSchema = z.object({
  eventId: z.string(),
  eventType: z.enum(["message", "message_edit", "reaction", "status"]),
  timestamp: z.number(),

  botId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),

  sender: z.object({
    id: z.string(),
    username: z.string().optional(),
    displayName: z.string().optional(),
    avatarUrl: z.string().optional(),
  }),
  conversation: z.object({
    id: z.string(),
    type: z.enum(["dm", "group", "channel", "thread"]),
    isPublic: z.boolean().optional(),
    parentId: z.string().optional(),
  }),
  message: z.object({
    id: z.string(),
    text: z.string(),
    replyToMessageId: z.string().optional(),
    attachments: z
      .array(
        z.object({
          type: z.string(),
          url: z.string(),
          mimeType: z.string().optional(),
          fileName: z.string().optional(),
          sizeBytes: z.number().optional(),
        })
      )
      .optional(),
  }),
  raw: z.record(z.string(), z.unknown()).optional(),
});
