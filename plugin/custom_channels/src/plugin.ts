/**
 * OpenClaw plugin registration entry point.
 *
 * This is the module referenced by openclaw.plugin.json → openclaw.extensions.
 * OpenClaw's plugin loader calls `register(api)` at runtime to wire this
 * channel into the gateway.
 */

import { monitorCustomProvider } from "./monitor.js";
import { sendMessage, editMessage } from "./send.js";
import { resolveAccounts, probeAccount, auditAccount } from "./accounts.js";
import type {
  ChannelHandlers,
  CustomChannelConfig,
  MessageContent,
  MessageTarget,
  ResolvedAccount,
} from "./types.js";

interface OpenClawPluginApi {
  registerChannel(definition: ChannelPluginRegistration): void;
}

interface ChannelPluginRegistration {
  plugin: ChannelPlugin;
}

interface ChannelPlugin {
  id: string;

  /** Start monitoring for inbound messages */
  monitor(
    config: unknown,
    handlers: ChannelHandlers,
    signal: AbortSignal
  ): Promise<void>;

  /** Send a reply */
  send(
    account: ResolvedAccount,
    target: MessageTarget,
    content: MessageContent
  ): Promise<{ messageId: string }>;

  /** Edit an existing message */
  edit?(
    account: ResolvedAccount,
    messageId: string,
    content: Pick<MessageContent, "text" | "parseMode">
  ): Promise<void>;

  /** Resolve accounts from config */
  resolveAccounts(config: CustomChannelConfig): Map<string, ResolvedAccount>;

  /** Probe account health */
  probeAccount(
    account: ResolvedAccount
  ): Promise<{ ok: boolean; latencyMs: number; error?: string }>;

  /** Audit account config */
  auditAccount(
    account: ResolvedAccount
  ): { warnings: string[]; errors: string[] };
}

const customChannelPlugin: ChannelPlugin = {
  id: "custom",
  monitor: monitorCustomProvider,
  send: sendMessage,
  edit: editMessage,
  resolveAccounts,
  probeAccount,
  auditAccount,
};

/**
 * Default export — OpenClaw plugin definition.
 */
export default {
  id: "custom-channel",

  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: customChannelPlugin });
  },
};
