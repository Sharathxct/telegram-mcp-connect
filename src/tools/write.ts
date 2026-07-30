import { describeEntity, resolveChat } from "../resolve.js";
import { formatMessage } from "../format.js";
import { writeAnnotations, type ToolDefinition } from "./types.js";
import { optionalPositiveInteger, requiredString } from "./validate.js";

export const writeTools: ToolDefinition[] = [
  {
    name: "tg_send_message",
    description:
      "Send a message to a Telegram chat AS the logged-in user. This is visible to the recipient immediately " +
      "and cannot be silently undone. Confirm the exact chat and wording with the user before calling.",
    inputSchema: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Chat name, @username, numeric id, phone, or \"me\" for your own Saved Messages" },
        text: { type: "string", description: "Message body" },
        replyTo: { type: "number", description: "Optional: id of the message to reply to" },
      },
      required: ["chat", "text"],
    },
    annotations: writeAnnotations("Send Telegram message", { destructive: false, idempotent: false }),
    handler: async (args, { client }) => {
      const text = requiredString(args, "text");
      const entity = await resolveChat(client, requiredString(args, "chat"));
      const info = describeEntity(entity);
      const replyTo = optionalPositiveInteger(args, "replyTo");

      const sent = await client.sendMessage(entity as Parameters<typeof client.sendMessage>[0], {
        message: text,
        ...(replyTo ? { replyTo } : {}),
      });

      return {
        ok: true,
        chat: info.title,
        message: formatMessage(sent, {
          chat: {
            ...(info.id ? { id: info.id } : {}),
            ...(info.username ? { username: info.username } : {}),
          },
        }),
      };
    },
  },

  {
    name: "tg_mark_read",
    description: "Mark a chat as read, clearing its unread badge.",
    inputSchema: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Chat name, @username, numeric id, phone, or \"me\" for your own Saved Messages" },
      },
      required: ["chat"],
    },
    annotations: writeAnnotations("Mark Telegram chat as read", { destructive: true, idempotent: true }),
    handler: async (args, { client }) => {
      const entity = await resolveChat(client, requiredString(args, "chat"));
      const info = describeEntity(entity);
      await client.markAsRead(entity as Parameters<typeof client.markAsRead>[0]);
      return { ok: true, chat: info.title };
    },
  },
];
