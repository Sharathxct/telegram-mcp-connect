import type { Api } from "teleproto";

export interface Sender {
  id?: unknown;
  firstName?: string;
  lastName?: string;
  username?: string;
  title?: string;
}

export interface ChatRef {
  id?: string;
  username?: string;
}

export function senderName(s: Sender | undefined): string {
  if (!s) return "unknown";
  if (s.title) return s.title;
  const name = [s.firstName, s.lastName].filter(Boolean).join(" ");
  if (name) return name;
  if (s.username) return `@${s.username}`;
  return s.id === undefined || s.id === null ? "unknown" : String(s.id);
}

interface DocAttribute {
  className?: string;
  fileName?: string;
  voice?: boolean;
  alt?: string;
  roundMessage?: boolean;
}

export function mediaLabel(media: unknown): string {
  if (!media) return "";
  const m = media as { className?: string; document?: { attributes?: DocAttribute[] }; poll?: { question?: { text?: string } } };
  switch (m.className) {
    case "MessageMediaPhoto":
      return "[photo]";
    case "MessageMediaGeo":
    case "MessageMediaGeoLive":
      return "[location]";
    case "MessageMediaContact":
      return "[contact]";
    case "MessageMediaPoll":
      return m.poll?.question?.text ? `[poll: ${m.poll.question.text}]` : "[poll]";
    case "MessageMediaWebPage":
      return "";
    case "MessageMediaDice":
      return "[dice]";
    case "MessageMediaDocument":
      return documentLabel(m.document?.attributes ?? []);
    default:
      return "[media]";
  }
}

function documentLabel(attributes: DocAttribute[]): string {
  const kinds = new Set(attributes.map((a) => a.className));
  const sticker = attributes.find((a) => a.className === "DocumentAttributeSticker");
  if (sticker) return sticker.alt ? `[sticker ${sticker.alt}]` : "[sticker]";

  const audio = attributes.find((a) => a.className === "DocumentAttributeAudio");
  if (audio?.voice) return "[voice note]";
  if (audio) return "[audio]";

  const video = attributes.find((a) => a.className === "DocumentAttributeVideo");
  if (video?.roundMessage) return "[video note]";
  if (kinds.has("DocumentAttributeAnimated")) return "[gif]";
  if (video) return "[video]";

  const named = attributes.find((a) => a.className === "DocumentAttributeFilename");
  return named?.fileName ? `[file: ${named.fileName}]` : "[file]";
}

export function messageLink(chat: ChatRef | undefined, messageId: number): string | null {
  if (!chat) return null;
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  const id = chat.id;
  if (!id) return null;

  const match = id.match(/^-100(\d+)$/);
  return match?.[1] ? `https://t.me/c/${match[1]}/${messageId}` : null;
}

export interface FormattedMessage {
  id: number;
  date: string | null;
  from: string;
  text: string;
  out: boolean;
  replyTo?: number;
  link?: string;
  chat?: string;
}

export function formatMessage(
  m: Api.Message,
  opts: { chat?: ChatRef; chatName?: string; sender?: Sender } = {},
): FormattedMessage {
  const sender = opts.sender ?? (m as unknown as { sender?: Sender }).sender;
  const media = mediaLabel((m as unknown as { media?: unknown }).media);
  const text = [m.message, media].filter(Boolean).join(" ").trim();
  const replyToId = (m as unknown as { replyTo?: { replyToMsgId?: number } }).replyTo?.replyToMsgId;
  const link = messageLink(opts.chat, m.id);

  return {
    id: m.id,
    date: m.date ? new Date(m.date * 1000).toISOString() : null,
    from: senderName(sender),
    text,
    out: m.out ?? false,
    ...(replyToId ? { replyTo: replyToId } : {}),
    ...(link ? { link } : {}),
    ...(opts.chatName ? { chat: opts.chatName } : {}),
  };
}

export function clampLimit(raw: unknown, fallback: number, max = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}
