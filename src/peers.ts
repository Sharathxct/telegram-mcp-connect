import { senderName, type Sender } from "./format.js";

export interface PeerInfo {
  id: string;
  name: string;
  username?: string;

  linkId?: string;
}

interface RawPeer {
  id?: unknown;
  className?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  title?: string;
}

export function buildPeerIndex(users: unknown[] = [], chats: unknown[] = []): Map<string, PeerInfo> {
  const index = new Map<string, PeerInfo>();

  for (const raw of users) {
    const u = raw as RawPeer;
    if (u?.id === undefined || u?.id === null) continue;
    const id = String(u.id);
    index.set(`user:${id}`, {
      id,
      name: senderName(u as Sender),
      ...(u.username ? { username: u.username } : {}),
    });
  }

  for (const raw of chats) {
    const c = raw as RawPeer;
    if (c?.id === undefined || c?.id === null) continue;
    const id = String(c.id);
    const isChannel = c.className === "Channel" || c.className === "ChannelForbidden";
    index.set(`${isChannel ? "channel" : "chat"}:${id}`, {
      id,
      name: senderName(c as Sender),
      ...(c.username ? { username: c.username } : {}),
      ...(isChannel ? { linkId: `-100${id}` } : {}),
    });
  }

  return index;
}

export function peerKey(peer: unknown): string | null {
  const p = peer as { className?: string; userId?: unknown; chatId?: unknown; channelId?: unknown };
  if (!p) return null;
  if (p.userId !== undefined && p.userId !== null) return `user:${String(p.userId)}`;
  if (p.channelId !== undefined && p.channelId !== null) return `channel:${String(p.channelId)}`;
  if (p.chatId !== undefined && p.chatId !== null) return `chat:${String(p.chatId)}`;
  return null;
}

export function lookupPeer(index: Map<string, PeerInfo>, peer: unknown): PeerInfo | undefined {
  const key = peerKey(peer);
  return key ? index.get(key) : undefined;
}
