import { describe, it, expect } from "vitest";
import { buildInboundContext } from "../context.js";
import type { RawInboundEvent } from "../types.js";

function makeEvent(overrides: Partial<RawInboundEvent> = {}): RawInboundEvent {
  return {
    eventId: "evt-1",
    eventType: "message",
    timestamp: 1700000000000,
    sender: {
      id: "user-42",
      username: "alice",
      displayName: "Alice",
    },
    conversation: {
      id: "conv-1",
      type: "dm",
    },
    message: {
      id: "msg-1",
      text: "Hello, OpenClaw!",
    },
    ...overrides,
  };
}

const defaultAccessFlags = {
  isDmAllowed: true,
  isGroupAllowed: false,
  requiresMention: false,
};

describe("buildInboundContext", () => {
  it("transforms a basic DM event into InboundContext", () => {
    const ctx = buildInboundContext(makeEvent(), defaultAccessFlags);

    expect(ctx.sender.id).toBe("user-42");
    expect(ctx.sender.username).toBe("alice");
    expect(ctx.conversationScope.type).toBe("dm");
    expect(ctx.conversationScope.id).toBe("conv-1");
    expect(ctx.messageContent.text).toBe("Hello, OpenClaw!");
    expect(ctx.messageContent.media).toBeUndefined();
    expect(ctx.accessControl.isDmAllowed).toBe(true);
  });

  it("normalizes media attachments", () => {
    const event = makeEvent({
      message: {
        id: "msg-2",
        text: "Check this out",
        attachments: [
          { type: "image/png", url: "https://example.com/a.png", mimeType: "image/png" },
          { type: "video", url: "https://example.com/b.mp4" },
          { type: "unknown", url: "https://example.com/c.bin" },
        ],
      },
    });

    const ctx = buildInboundContext(event, defaultAccessFlags);
    expect(ctx.messageContent.media).toHaveLength(3);
    expect(ctx.messageContent.media![0].type).toBe("image");
    expect(ctx.messageContent.media![1].type).toBe("video");
    expect(ctx.messageContent.media![2].type).toBe("document");
  });

  it("preserves platform metadata from raw field", () => {
    const event = makeEvent({ raw: { customField: "hello" } });
    const ctx = buildInboundContext(event, defaultAccessFlags);
    expect(ctx.platformMetadata).toEqual({ customField: "hello" });
  });

  it("handles group conversations", () => {
    const event = makeEvent({
      conversation: { id: "grp-1", type: "group", isPublic: true },
    });
    const ctx = buildInboundContext(event, {
      isDmAllowed: false,
      isGroupAllowed: true,
      requiresMention: true,
    });

    expect(ctx.conversationScope.type).toBe("group");
    expect(ctx.conversationScope.isPublic).toBe(true);
    expect(ctx.accessControl.isGroupAllowed).toBe(true);
    expect(ctx.accessControl.requiresMention).toBe(true);
  });
});
