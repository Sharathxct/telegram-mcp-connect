import { Api } from "teleproto";
import { clampLimit, formatMessage, senderName, type Sender } from "../format.js";
import { buildPeerIndex, lookupPeer } from "../peers.js";
import { describeEntity, resolveChat, scoreTitle } from "../resolve.js";
import { readOnlyAnnotations, type ToolDefinition } from "./types.js";
import { optionalBoolean, optionalPositiveInteger, optionalString, requiredString } from "./validate.js";

export const readTools: ToolDefinition[] = [
  {
    name: "tg_get_me",
    description: "Get the logged-in Telegram account info. Useful to confirm which account this server is reading.",
    inputSchema: { type: "object", properties: {} },
    annotations: readOnlyAnnotations("Get connected Telegram account"),
    handler: async (_args, { client }) => {
      const me = (await client.getMe()) as unknown as Sender;
      return { id: String(me.id), name: senderName(me), username: me.username };
    },
  },

  {
    name: "tg_list_chats",
    description:
      "List Telegram chats (DMs, groups, channels) newest-activity first, with the last message preview and unread count. " +
      "Use this first to discover chat names and ids.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max chats (default 30, max 100)" },
        query: { type: "string", description: "Optional: only chats whose name matches this text" },
        unreadOnly: { type: "boolean", description: "Optional: only chats with unread messages" },
      },
    },
    annotations: readOnlyAnnotations("List Telegram chats"),
    handler: async (args, { client }) => {
      const limit = clampLimit(optionalPositiveInteger(args, "limit"), 30);
      const query = optionalString(args, "query") ?? "";
      const unreadOnly = optionalBoolean(args, "unreadOnly") ?? false;

      const dialogs = await client.getDialogs({ limit: query || unreadOnly ? 200 : limit });

      let rows = dialogs.map((d) => ({
        name: d.title || senderName(d.entity as unknown as Sender),
        id: String(d.id),
        unread: d.unreadCount,
        isGroup: d.isGroup,
        isChannel: d.isChannel,
        isUser: d.isUser,
        lastMessage: d.message?.message?.slice(0, 200) || (d.message?.media ? "[media]" : ""),
        lastDate: d.message?.date ? new Date(d.message.date * 1000).toISOString() : null,
      }));

      if (unreadOnly) rows = rows.filter((r) => (r.unread ?? 0) > 0);
      if (query) rows = rows.filter((r) => scoreTitle(r.name, query) > 0);
      return rows.slice(0, limit);
    },
  },

  {
    name: "tg_read_chat",
    description:
      "Read recent messages from one chat, newest first. `chat` accepts a chat name (fuzzy, e.g. \"Acme <> Contoso\"), " +
      "an @username, a numeric id from tg_list_chats, or a phone number. " +
      "To page further back, pass `beforeId` set to the lowest id you have already seen.",
    inputSchema: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Chat name, @username, numeric id, phone, or \"me\" for your own Saved Messages" },
        limit: { type: "number", description: "Max messages (default 30, max 100)" },
        beforeId: { type: "number", description: "Only return messages older than this message id" },
      },
      required: ["chat"],
    },
    annotations: readOnlyAnnotations("Read Telegram chat"),
    handler: async (args, { client }) => {
      const limit = clampLimit(optionalPositiveInteger(args, "limit"), 30);
      const entity = await resolveChat(client, requiredString(args, "chat"));
      const info = describeEntity(entity);
      const offsetId = optionalPositiveInteger(args, "beforeId");

      const messages = await client.getMessages(entity as Parameters<typeof client.getMessages>[0], {
        limit,
        ...(offsetId ? { offsetId } : {}),
      });

      const chatRef = {
        ...(info.id ? { id: info.id } : {}),
        ...(info.username ? { username: info.username } : {}),
      };

      return {
        chat: info.title,
        chatId: info.id ?? null,
        messages: messages.map((m) => formatMessage(m, { chat: chatRef })),
      };
    },
  },

  {
    name: "tg_search",
    description:
      "Search messages by text. Global across all chats, or within one chat when `chat` is given. " +
      "Results include the sender and which chat each hit came from.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text" },
        chat: { type: "string", description: "Optional: restrict to this chat (name, @username, or id)" },
        limit: { type: "number", description: "Max results (default 20, max 100)" },
      },
      required: ["query"],
    },
    annotations: readOnlyAnnotations("Search Telegram messages"),
    handler: async (args, { client }) => {
      const limit = clampLimit(optionalPositiveInteger(args, "limit"), 20);
      const query = requiredString(args, "query");
      const chatArg = optionalString(args, "chat");

      if (chatArg) {
        const entity = await resolveChat(client, chatArg);
        const info = describeEntity(entity);
        const chatRef = {
          ...(info.id ? { id: info.id } : {}),
          ...(info.username ? { username: info.username } : {}),
        };
        const messages = await client.getMessages(entity as Parameters<typeof client.getMessages>[0], {
          limit,
          search: query,
        });
        return messages.map((m) => formatMessage(m, { chat: chatRef, chatName: info.title }));
      }

      const res = await client.invoke(
        new Api.messages.SearchGlobal({
          q: query,
          filter: new Api.InputMessagesFilterEmpty(),
          minDate: 0,
          maxDate: 0,
          offsetRate: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          offsetId: 0,
          limit,
        }),
      );

      const payload = res as unknown as { messages?: unknown[]; users?: unknown[]; chats?: unknown[] };
      const index = buildPeerIndex(payload.users, payload.chats);

      return (payload.messages ?? [])
        .filter((m): m is Api.Message => m instanceof Api.Message)
        .map((m) => {
          const chat = lookupPeer(index, (m as unknown as { peerId?: unknown }).peerId);
          const from = lookupPeer(index, (m as unknown as { fromId?: unknown }).fromId) ?? chat;
          return formatMessage(m, {
            ...(from ? { sender: { firstName: from.name, username: from.username } } : {}),
            ...(chat ? { chatName: chat.name } : {}),
            ...(chat ? { chat: { ...(chat.linkId ? { id: chat.linkId } : {}), ...(chat.username ? { username: chat.username } : {}) } } : {}),
          });
        });
    },
  },
];
