import { describe, it, expect } from "vitest";
import { resolveAccounts, auditAccount } from "../accounts.js";
import type { CustomChannelConfig, ResolvedAccount } from "../types.js";

function makeConfig(
  accounts: Record<string, unknown> = {}
): CustomChannelConfig {
  return {
    enabled: true,
    dmPolicy: "open",
    groupPolicy: "disabled",
    transport: "webhook",
    accounts: accounts as CustomChannelConfig["accounts"],
  };
}

describe("resolveAccounts", () => {
  it("resolves valid accounts", () => {
    const result = resolveAccounts(
      makeConfig({
        bot1: {
          apiBaseUrl: "https://example.com",
          apiToken: "token-1234567890abcdef",
        },
      })
    );

    expect(result.size).toBe(1);
    expect(result.get("bot1")?.accountId).toBe("bot1");
    expect(result.get("bot1")?.status).toBe("disconnected");
  });

  it("skips invalid accounts and keeps valid ones", () => {
    const result = resolveAccounts(
      makeConfig({
        good: {
          apiBaseUrl: "https://example.com",
          apiToken: "valid-token-abcdef",
        },
        bad: {
          apiBaseUrl: "not-a-url",
          apiToken: "",
        },
      })
    );

    expect(result.size).toBe(1);
    expect(result.has("good")).toBe(true);
    expect(result.has("bad")).toBe(false);
  });

  it("throws if no valid accounts remain", () => {
    expect(() =>
      resolveAccounts(makeConfig({ bad: { apiBaseUrl: "x", apiToken: "" } }))
    ).toThrow("No valid accounts found");
  });
});

describe("auditAccount", () => {
  it("warns about non-HTTPS URL", () => {
    const account: ResolvedAccount = {
      accountId: "test",
      config: {
        apiBaseUrl: "http://example.com",
        apiToken: "long-enough-token-value",
      },
      status: "disconnected",
    };

    const result = auditAccount(account);
    expect(result.warnings).toContain(
      "apiBaseUrl does not use HTTPS — traffic will be unencrypted"
    );
  });

  it("warns about short token", () => {
    const account: ResolvedAccount = {
      accountId: "test",
      config: {
        apiBaseUrl: "https://example.com",
        apiToken: "short",
      },
      status: "disconnected",
    };

    const result = auditAccount(account);
    expect(result.warnings).toContain(
      "apiToken is shorter than 16 characters — may be invalid"
    );
  });

  it("returns no warnings for well-configured account", () => {
    const account: ResolvedAccount = {
      accountId: "test",
      config: {
        apiBaseUrl: "https://api.example.com",
        apiToken: "sk-very-long-secure-token-value",
      },
      status: "disconnected",
    };

    const result = auditAccount(account);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
