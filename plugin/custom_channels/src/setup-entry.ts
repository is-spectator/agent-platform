/**
 * Setup entry — interactive wizard for `openclaw setup custom`.
 *
 * OpenClaw calls this module during the guided channel setup flow.
 * It collects credentials, validates them, and writes the account config.
 */

import { probeAccount } from "./accounts.js";
import type { ResolvedAccount, CustomAccountConfig } from "./types.js";

export interface SetupContext {
  prompt(question: string): Promise<string>;
  secret(question: string): Promise<string>;
  select(question: string, choices: string[]): Promise<string>;
  log(message: string): void;
  writeAccountConfig(accountId: string, config: CustomAccountConfig): Promise<void>;
}

export default async function setup(ctx: SetupContext): Promise<void> {
  ctx.log("=== Custom Channel Setup ===\n");

  // 1. Collect API base URL
  const apiBaseUrl = await ctx.prompt(
    "Enter your Bot Gateway base URL (e.g. http://47.90.246.218:8081):"
  );

  // 2. Collect bot id + token
  const botId = await ctx.prompt("Enter your botId (e.g. bot_...):");
  const apiToken = await ctx.secret("Enter your botToken (Bearer token):");

  // 3. Optional webhook secret
  const webhookSecret = await ctx.secret(
    "Enter webhook secret (press Enter to skip):"
  );

  // 4. Choose transport
  const transport = await ctx.select("Select transport mode:", [
    "webhook",
    "websocket",
    "polling",
  ]);

  // 5. Account label
  const label =
    (await ctx.prompt("Account label (default: main):")) || "main";

  // 6. Probe connectivity
  ctx.log("\nTesting connection...");
  const account: ResolvedAccount = {
    accountId: label,
    config: {
      apiBaseUrl,
      botId: botId || undefined,
      apiToken,
      webhookSecret: webhookSecret || undefined,
      label,
    },
    status: "disconnected",
  };

  const probe = await probeAccount(account);
  if (probe.ok) {
    ctx.log(`Connected successfully (${probe.latencyMs}ms latency)`);
  } else {
    ctx.log(
      `Warning: Could not reach ${apiBaseUrl}/health — ${probe.error}\n` +
        "The account will still be saved. You can fix the URL later."
    );
  }

  // 7. Save
  await ctx.writeAccountConfig(label, account.config);
  ctx.log(`\nAccount "${label}" saved. Run \`openclaw gateway\` to start.`);
}
