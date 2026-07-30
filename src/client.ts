import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { isCompleteConfig, readConfig, type TgConfig } from "./config.js";
import { createStderrLogger } from "./logger.js";

const CONNECT_TIMEOUT_MS = Number(process.env.TG_MCP_CONNECT_TIMEOUT_MS) || 20_000;

export class NotLoggedInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotLoggedInError";
  }
}

let pending: Promise<TelegramClient> | null = null;

export function buildClient(config: TgConfig): TelegramClient {
  return new TelegramClient(new StringSession(config.session), config.apiId, config.apiHash, {
    connectionRetries: 3,
    baseLogger: createStderrLogger(),

    floodSleepThreshold: 60,
  });
}

export async function getClient(): Promise<TelegramClient> {
  if (pending) {
    const existing = await pending.catch(() => null);
    if (existing?.connected) return existing;
    pending = null;
  }

  const config = readConfig();
  if (!config.apiId || !config.apiHash) {
    throw new NotLoggedInError(
      "No Telegram API credentials found. Run `npx telegram-mcp-connect setup` to connect your account.",
    );
  }
  if (!isCompleteConfig(config)) {
    throw new NotLoggedInError(
      "Not signed in to Telegram. Run `npx telegram-mcp-connect setup` to finish the phone login.",
    );
  }

  pending = (async () => {
    const client = buildClient(config);
    await withTimeout(
      client.connect(),
      CONNECT_TIMEOUT_MS,
      `Timed out connecting to Telegram after ${CONNECT_TIMEOUT_MS}ms. Check your network, then retry.`,
    );
    return client;
  })();

  try {
    return await pending;
  } catch (err) {
    pending = null;
    throw translateAuthError(err);
  }
}

export async function disconnectClient(): Promise<void> {
  const client = await pending?.catch(() => null);
  pending = null;
  await client?.disconnect().catch(() => undefined);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function translateAuthError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|AUTH_KEY_DUPLICATED|USER_DEACTIVATED/i.test(message)) {
    return new NotLoggedInError(
      "Your Telegram session is no longer valid — it was probably revoked from Settings → Devices. " +
        "Run `npx telegram-mcp-connect setup` to sign in again.",
    );
  }
  if (/API_ID_INVALID|API_ID_PUBLISHED_FLOOD/i.test(message)) {
    return new Error(
      "Telegram rejected the API ID/hash. Re-create the app at https://my.telegram.org/apps and run `npx telegram-mcp-connect setup`.",
    );
  }
  return err instanceof Error ? err : new Error(message);
}
