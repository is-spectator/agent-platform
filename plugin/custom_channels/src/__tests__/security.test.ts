import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../security.js";

describe("verifyWebhookSignature", () => {
  const secret = "test-secret-key";
  const payload = '{"eventId":"evt-1","text":"hello"}';

  function sign(body: string, key: string): string {
    return createHmac("sha256", key).update(body, "utf-8").digest("hex");
  }

  it("accepts a valid signature", () => {
    const sig = sign(payload, secret);
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(verifyWebhookSignature(payload, "bad-sig", secret)).toBe(false);
  });

  it("rejects signature from wrong secret", () => {
    const sig = sign(payload, "wrong-secret");
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(false);
  });

  it("rejects empty signature", () => {
    expect(verifyWebhookSignature(payload, "", secret)).toBe(false);
  });
});
