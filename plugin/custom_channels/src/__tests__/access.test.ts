import { describe, it, expect } from "vitest";
import { evaluateAccess } from "../access.js";
import type { CustomChannelConfig, RawInboundEvent } from "../types.js";

function makeEvent(
  overrides: Partial<RawInboundEvent> = {}
): RawInboundEvent {
  return {
    eventId: "evt-1",
    eventType: "message",
    timestamp: Date.now(),
    sender: { id: "user-1", username: "alice" },
    conversation: { id: "conv-1", type: "dm" },
    message: { id: "msg-1", text: "hi" },
    ...overrides,
  };
}

function makeConfig(
  overrides: Partial<CustomChannelConfig> = {}
): CustomChannelConfig {
  return {
    enabled: true,
    dmPolicy: "open",
    groupPolicy: "disabled",
    accounts: {
      main: {
        apiBaseUrl: "https://example.com",
        apiToken: "test-token-1234567890",
      },
    },
    transport: "webhook",
    ...overrides,
  };
}

describe("evaluateAccess", () => {
  describe("DM policy", () => {
    it("allows all DMs when policy is open", () => {
      const result = evaluateAccess(makeEvent(), makeConfig({ dmPolicy: "open" }));
      expect(result.allowed).toBe(true);
      expect(result.isDmAllowed).toBe(true);
    });

    it("blocks DM from unknown sender when policy is allowlist", () => {
      const result = evaluateAccess(
        makeEvent(),
        makeConfig({ dmPolicy: "allowlist", allowFrom: ["other-user"] })
      );
      expect(result.allowed).toBe(false);
    });

    it("allows DM from listed sender by id", () => {
      const result = evaluateAccess(
        makeEvent(),
        makeConfig({ dmPolicy: "allowlist", allowFrom: ["user-1"] })
      );
      expect(result.allowed).toBe(true);
    });

    it("allows DM from listed sender by username", () => {
      const result = evaluateAccess(
        makeEvent(),
        makeConfig({ dmPolicy: "allowlist", allowFrom: ["alice"] })
      );
      expect(result.allowed).toBe(true);
    });

    it("allows DM from listed sender by @username", () => {
      const result = evaluateAccess(
        makeEvent(),
        makeConfig({ dmPolicy: "allowlist", allowFrom: ["@alice"] })
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("Group policy", () => {
    const groupEvent = makeEvent({
      conversation: { id: "grp-1", type: "group" },
    });

    it("blocks groups when policy is disabled", () => {
      const result = evaluateAccess(
        groupEvent,
        makeConfig({ groupPolicy: "disabled" })
      );
      expect(result.allowed).toBe(false);
    });

    it("allows all groups when policy is open", () => {
      const result = evaluateAccess(
        groupEvent,
        makeConfig({ groupPolicy: "open" })
      );
      expect(result.allowed).toBe(true);
    });

    it("blocks group with allowlist when sender not in list", () => {
      const result = evaluateAccess(
        groupEvent,
        makeConfig({
          groupPolicy: "allowlist",
          groupAllowFrom: ["other-user"],
        })
      );
      expect(result.allowed).toBe(false);
    });

    it("allows group with allowlist when sender is in list", () => {
      const result = evaluateAccess(
        groupEvent,
        makeConfig({
          groupPolicy: "allowlist",
          groupAllowFrom: ["user-1"],
        })
      );
      expect(result.allowed).toBe(true);
    });

    it("blocks group when per-group override is disabled", () => {
      const result = evaluateAccess(
        groupEvent,
        makeConfig({
          groupPolicy: "allowlist",
          groupAllowFrom: ["user-1"],
          groups: { "grp-1": { disabled: true } },
        })
      );
      expect(result.allowed).toBe(false);
    });

    it("uses per-group allowFrom over global", () => {
      const result = evaluateAccess(
        groupEvent,
        makeConfig({
          groupPolicy: "allowlist",
          groupAllowFrom: ["user-1"],
          groups: { "grp-1": { allowFrom: ["other-user"] } },
        })
      );
      expect(result.allowed).toBe(false);
    });

    it("respects requireMention on per-group config", () => {
      const result = evaluateAccess(
        groupEvent,
        makeConfig({
          groupPolicy: "open",
          groups: { "grp-1": { requireMention: true } },
        })
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresMention).toBe(true);
    });
  });
});
