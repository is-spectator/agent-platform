import type { CustomChannelConfig, RawInboundEvent } from "./types.js";

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  isDmAllowed: boolean;
  isGroupAllowed: boolean;
  requiresMention: boolean;
}

/**
 * Evaluate whether an inbound event should be processed, based on
 * the channel's DM / group access policies.
 */
export function evaluateAccess(
  event: RawInboundEvent,
  config: CustomChannelConfig
): AccessDecision {
  const convType = event.conversation.type;
  const senderId = event.sender.id;
  const senderUsername = event.sender.username;

  // --- DM policy ---
  if (convType === "dm") {
    const dmAllowed = evaluateDmPolicy(senderId, senderUsername, config);
    return {
      allowed: dmAllowed,
      reason: dmAllowed ? undefined : "Sender not allowed by DM policy",
      isDmAllowed: dmAllowed,
      isGroupAllowed: false,
      requiresMention: false,
    };
  }

  // --- Group / channel / thread policy ---
  const groupAllowed = evaluateGroupPolicy(
    event.conversation.id,
    senderId,
    senderUsername,
    config
  );

  const requiresMention = getRequiresMention(event.conversation.id, config);

  return {
    allowed: groupAllowed,
    reason: groupAllowed ? undefined : "Sender or group not allowed by group policy",
    isDmAllowed: false,
    isGroupAllowed: groupAllowed,
    requiresMention,
  };
}

function evaluateDmPolicy(
  senderId: string,
  senderUsername: string | undefined,
  config: CustomChannelConfig
): boolean {
  switch (config.dmPolicy) {
    case "open":
      return true;

    case "allowlist":
      return matchesSenderList(senderId, senderUsername, config.allowFrom ?? []);

    case "pairing":
      // In pairing mode, the monitor layer handles code exchange.
      // For evaluation purposes, treat unknown senders as "not yet allowed".
      return matchesSenderList(senderId, senderUsername, config.allowFrom ?? []);

    default:
      return false;
  }
}

function evaluateGroupPolicy(
  groupId: string,
  senderId: string,
  senderUsername: string | undefined,
  config: CustomChannelConfig
): boolean {
  if (config.groupPolicy === "disabled") return false;
  if (config.groupPolicy === "open") return true;

  // allowlist mode
  const groupOverride = config.groups?.[groupId];
  if (groupOverride?.disabled) return false;

  // Per-group allowFrom takes precedence
  const senderList =
    groupOverride?.allowFrom ?? config.groupAllowFrom ?? [];

  return matchesSenderList(senderId, senderUsername, senderList);
}

function getRequiresMention(
  groupId: string,
  config: CustomChannelConfig
): boolean {
  return config.groups?.[groupId]?.requireMention ?? false;
}

function matchesSenderList(
  senderId: string,
  senderUsername: string | undefined,
  list: string[]
): boolean {
  if (list.length === 0) return false;
  return list.some(
    (entry) =>
      entry === senderId ||
      (senderUsername && entry === senderUsername) ||
      (senderUsername && entry === `@${senderUsername}`)
  );
}
