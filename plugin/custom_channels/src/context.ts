import type {
  InboundContext,
  MediaAttachment,
  RawInboundEvent,
} from "./types.js";

/**
 * Transform a raw inbound event from your platform into the
 * standardized OpenClaw InboundContext.
 *
 * This is the main normalization layer — adapt it to match your
 * product's actual event schema.
 */
export function buildInboundContext(
  event: RawInboundEvent,
  accessFlags: {
    isDmAllowed: boolean;
    isGroupAllowed: boolean;
    requiresMention: boolean;
  }
): InboundContext {
  const media: MediaAttachment[] = (event.message.attachments ?? []).map(
    (a) => ({
      type: normalizeMediaType(a.type),
      url: a.url,
      mimeType: a.mimeType,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
    })
  );

  return {
    sender: {
      id: event.sender.id,
      username: event.sender.username,
      displayName: event.sender.displayName,
      avatarUrl: event.sender.avatarUrl,
    },
    conversationScope: {
      type: event.conversation.type,
      id: event.conversation.id,
      isPublic: event.conversation.isPublic ?? false,
      parentId: event.conversation.parentId,
    },
    messageContent: {
      text: event.message.text,
      media: media.length > 0 ? media : undefined,
      replyToMessageId: event.message.replyToMessageId,
      timestamp: event.timestamp,
    },
    platformMetadata: event.raw ?? {},
    accessControl: accessFlags,
  };
}

function normalizeMediaType(
  raw: string
): MediaAttachment["type"] {
  const lower = raw.toLowerCase();
  if (lower.startsWith("image")) return "image";
  if (lower.startsWith("audio")) return "audio";
  if (lower.startsWith("video")) return "video";
  if (lower === "sticker") return "sticker";
  return "document";
}
