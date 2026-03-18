import {
  CustomAccountConfig,
  CustomAccountConfigSchema,
  CustomChannelConfig,
  ResolvedAccount,
} from "./types.js";

/**
 * Resolve and validate all accounts declared in the channel config.
 * Returns a map of accountId → ResolvedAccount ready for use.
 */
export function resolveAccounts(
  config: CustomChannelConfig
): Map<string, ResolvedAccount> {
  const resolved = new Map<string, ResolvedAccount>();

  for (const [accountId, raw] of Object.entries(config.accounts)) {
    const parsed = CustomAccountConfigSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        `[mars] Skipping account "${accountId}": ${parsed.error.message}`
      );
      continue;
    }

    resolved.set(accountId, {
      accountId,
      config: parsed.data as CustomAccountConfig,
      status: "disconnected",
    });
  }

  if (resolved.size === 0) {
    throw new Error(
      "[mars] No valid accounts found. Check your configuration."
    );
  }

  return resolved;
}

/**
 * Probe an account's connectivity by hitting its API health endpoint.
 */
export async function probeAccount(
  account: ResolvedAccount
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const url = new URL("/api/health", account.config.apiBaseUrl);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${account.config.apiToken}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    return {
      ok: res.ok,
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Audit account configuration for common misconfigurations.
 */
export function auditAccount(
  account: ResolvedAccount
): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  const { config } = account;

  if (!config.apiBaseUrl.startsWith("https://")) {
    warnings.push("apiBaseUrl does not use HTTPS — traffic will be unencrypted");
  }

  if (config.apiToken.length < 16) {
    warnings.push("apiToken is shorter than 16 characters — may be invalid");
  }

  try {
    new URL(config.apiBaseUrl);
  } catch {
    errors.push(`apiBaseUrl is not a valid URL: ${config.apiBaseUrl}`);
  }

  return { warnings, errors };
}
