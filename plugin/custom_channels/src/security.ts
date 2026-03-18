import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify the webhook signature sent by your platform.
 *
 * Expects HMAC-SHA256 hex digest in the `x-signature` header.
 * Adapt the algorithm if your platform uses a different scheme.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret)
    .update(payload, "utf-8")
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;

  return timingSafeEqual(
    Buffer.from(expected, "utf-8"),
    Buffer.from(signature, "utf-8")
  );
}
