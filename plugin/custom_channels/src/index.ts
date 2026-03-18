/**
 * openclaw-channel-mars
 *
 * Custom channel plugin for OpenClaw.
 * Drop-in integration for your product — similar to Telegram, Discord, Slack.
 *
 * Usage in openclaw config:
 *
 *   {
 *     "channels": {
 *       "mars": {
 *         "enabled": true,
 *         "transport": "webhook",
 *         "webhook": { "port": 3100, "path": "/webhook/custom" },
 *         "dmPolicy": "pairing",
 *         "accounts": {
 *           "main": {
 *             "apiBaseUrl": "https://your-product.com",
 *             "apiToken": "sk-..."
 *           }
 *         }
 *       }
 *     }
 *   }
 */

// Main monitor entry point
export { monitorCustomProvider } from "./monitor.js";

// Outbound messaging
export { sendMessage, editMessage } from "./send.js";

// Bot Gateway WebSocket (optional helper)
export { setBotGatewaySendFn } from "./ws-session.js";

// Account management
export { resolveAccounts, probeAccount, auditAccount } from "./accounts.js";

// Context builder
export { buildInboundContext } from "./context.js";

// Access control
export { evaluateAccess } from "./access.js";

// Security
export { verifyWebhookSignature } from "./security.js";

// OpenClaw plugin definition (default export)
export { default as plugin } from "./plugin.js";

// Types
export type {
  InboundContext,
  MediaAttachment,
  MessageTarget,
  MessageContent,
  OutboundMedia,
  ChannelHandlers,
  ChannelStatus,
  CustomAccountConfig,
  ResolvedAccount,
  CustomChannelConfig,
  GroupConfig,
  RawInboundEvent,
} from "./types.js";

// Zod schemas (for runtime validation)
export {
  CustomAccountConfigSchema,
  CustomChannelConfigSchema,
  GroupConfigSchema,
  RawInboundEventSchema,
} from "./types.js";
