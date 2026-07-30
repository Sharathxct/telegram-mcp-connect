import type { TelegramClient } from "teleproto";
import { utils } from "teleproto";
import { senderName, type Sender } from "./format.js";

export interface DialogRef {
  id: string;
  title: string;
  username?: string;
  entity: unknown;
}

const DIALOG_CACHE_MS = 60_000;
const DIALOG_SCAN_LIMIT = 300;

let cache: { at: number; dialogs: DialogRef[] } | null = null;

export async function listDialogRefs(client: TelegramClient): Promise<DialogRef[]> {
  const now = Date.now();
  if (cache && now - cache.at < DIALOG_CACHE_MS) return cache.dialogs;

  const dialogs = await client.getDialogs({ limit: DIALOG_SCAN_LIMIT });
  const refs: DialogRef[] = dialogs.map((d) => {
    const entity = d.entity as unknown as Sender & { username?: string };
    return {
      id: String(d.id),
      title: d.title || senderName(entity),
      ...(entity?.username ? { username: entity.username } : {}),
      entity: d.entity,
    };
  });
  cache = { at: now, dialogs: refs };
  return refs;
}

function normalise(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

const MIN_PARTIAL_MATCH_LENGTH = 4;

export function scoreTitle(title: string, query: string): number {
  const t = normalise(title);
  const q = normalise(query);
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (q.length < MIN_PARTIAL_MATCH_LENGTH) return 0;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => t.includes(token))) return 40;
  return 0;
}

export function rankDialogs(dialogs: DialogRef[], query: string): DialogRef[] {
  return dialogs
    .map((d) => ({ d, score: Math.max(scoreTitle(d.title, query), d.username ? scoreTitle(d.username, query) : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.d);
}

export class ChatNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatNotFoundError";
  }
}

const USERNAME = /^@[A-Za-z0-9_]{3,}$/;
const NUMERIC_ID = /^-?\d+$/;
const PHONE = /^\+[\d\s-]{6,}$/;

const SELF_ALIASES = new Set([
  "me",
  "self",
  "myself",
  "saved",
  "saved messages",
  "my saved messages",
]);

export function isSelfAlias(value: string): boolean {
  return SELF_ALIASES.has(normalise(value));
}

export async function resolveChat(client: TelegramClient, input: string): Promise<unknown> {
  const value = input.trim();
  if (!value) throw new ChatNotFoundError("No chat given.");

  if (isSelfAlias(value)) return client.getMe();

  if (USERNAME.test(value) || NUMERIC_ID.test(value) || PHONE.test(value)) {
    try {
      return await client.getEntity(value);
    } catch (err) {
      const byId = (await listDialogRefs(client)).find((d) => d.id === value);
      if (byId) return byId.entity;
      if (USERNAME.test(value) || PHONE.test(value)) throw err;
      throw new ChatNotFoundError(
        `No chat with id ${value}. Call tg_list_chats to see available chats and their ids.`,
      );
    }
  }

  const matches = rankDialogs(await listDialogRefs(client), value);
  const best = matches[0];
  if (!best) {
    throw new ChatNotFoundError(
      `No chat matching "${value}". Call tg_list_chats to see what is available, ` +
        `or pass an @username or a numeric id.`,
    );
  }

  const topScore = scoreTitle(best.title, value);
  const tied = matches.filter((m) => scoreTitle(m.title, value) === topScore);
  if (tied.length > 1 && topScore < 100) {
    const names = tied.slice(0, 8).map((m) => `${m.title} (${m.id})`).join(", ");
    throw new ChatNotFoundError(`"${value}" matches several chats: ${names}. Retry with an exact title or id.`);
  }
  return best.entity;
}

export function markedId(entity: unknown): string | undefined {
  try {
    const id = utils.getPeerId(entity as Parameters<typeof utils.getPeerId>[0]);
    if (id === undefined || id === null) return undefined;
    return String(id);
  } catch {
    const raw = (entity as { id?: unknown })?.id;
    return raw === undefined || raw === null ? undefined : String(raw);
  }
}

export function describeEntity(entity: unknown): { id?: string; username?: string; title: string } {
  const e = entity as Sender & { username?: string };
  const id = markedId(entity);
  return {
    ...(id ? { id } : {}),
    ...(e?.username ? { username: e.username } : {}),
    title: senderName(e),
  };
}
