import { test, expect, describe } from "bun:test";
import type { Api } from "teleproto";
import { clampLimit, formatMessage, mediaLabel, messageLink, senderName } from "../src/format.js";

describe("senderName", () => {
  test("prefers a channel/group title", () => {
    expect(senderName({ title: "Product Updates", firstName: "ignored" })).toBe("Product Updates");
  });

  test("joins first and last name", () => {
    expect(senderName({ firstName: "Alex", lastName: "Rivera" })).toBe("Alex Rivera");
  });

  test("falls back to @username, then id", () => {
    expect(senderName({ username: "alex_rivera" })).toBe("@alex_rivera");
    expect(senderName({ id: 100000001 })).toBe("100000001");
    expect(senderName(undefined)).toBe("unknown");
  });
});

describe("mediaLabel", () => {
  test("names the media type instead of a generic [media]", () => {
    expect(mediaLabel({ className: "MessageMediaPhoto" })).toBe("[photo]");
    expect(mediaLabel({ className: "MessageMediaPoll", poll: { question: { text: "ship it?" } } })).toBe(
      "[poll: ship it?]",
    );
  });

  test("distinguishes documents by attribute", () => {
    const doc = (attributes: unknown[]) => mediaLabel({ className: "MessageMediaDocument", document: { attributes } });
    expect(doc([{ className: "DocumentAttributeAudio", voice: true }])).toBe("[voice note]");
    expect(doc([{ className: "DocumentAttributeVideo", roundMessage: true }])).toBe("[video note]");
    expect(doc([{ className: "DocumentAttributeSticker", alt: "🔥" }])).toBe("[sticker 🔥]");
    expect(doc([{ className: "DocumentAttributeFilename", fileName: "deck.pdf" }])).toBe("[file: deck.pdf]");
  });

  test("suppresses link previews, which add nothing over the text", () => {
    expect(mediaLabel({ className: "MessageMediaWebPage" })).toBe("");
  });

  test("no media means no label", () => {
    expect(mediaLabel(undefined)).toBe("");
  });
});

describe("messageLink", () => {
  test("uses the public username when there is one", () => {
    expect(messageLink({ username: "product_updates" }, 42)).toBe("https://t.me/product_updates/42");
  });

  test("uses the /c/ form for supergroups and channels", () => {
    expect(messageLink({ id: "-1001234567890" }, 7)).toBe("https://t.me/c/1234567890/7");
  });

  test("returns null for DMs, which have no public link", () => {
    expect(messageLink({ id: "100000001" }, 7)).toBeNull();
    expect(messageLink(undefined, 7)).toBeNull();
  });
});

describe("clampLimit", () => {
  test("falls back on junk and clamps to the max", () => {
    expect(clampLimit(undefined, 30)).toBe(30);
    expect(clampLimit(0, 30)).toBe(30);
    expect(clampLimit(-5, 30)).toBe(30);
    expect(clampLimit("abc", 30)).toBe(30);
    expect(clampLimit(500, 30)).toBe(100);
    expect(clampLimit(12, 30)).toBe(12);
  });
});

describe("formatMessage", () => {
  const base = { id: 4102, date: 1785350547, message: "sounds good to me", out: false } as Api.Message;

  test("formats the common case", () => {
    const result = formatMessage({ ...base, sender: { firstName: "Alex", lastName: "Rivera" } } as Api.Message);
    expect(result.from).toBe("Alex Rivera");
    expect(result.text).toBe("sounds good to me");
    expect(result.date).toBe(new Date(1785350547 * 1000).toISOString());
    expect(result.out).toBe(false);
  });

  test("appends a media label to the caption", () => {
    const result = formatMessage({ ...base, message: "look", media: { className: "MessageMediaPhoto" } } as Api.Message);
    expect(result.text).toBe("look [photo]");
  });

  test("carries reply and permalink when available", () => {
    const result = formatMessage(
      { ...base, replyTo: { replyToMsgId: 4098 } } as unknown as Api.Message,
      { chat: { id: "-1001234567890" } },
    );
    expect(result.replyTo).toBe(4098);
    expect(result.link).toBe("https://t.me/c/1234567890/4102");
  });

  test("omits optional keys rather than emitting nulls", () => {
    const result = formatMessage(base);
    expect(result).not.toHaveProperty("replyTo");
    expect(result).not.toHaveProperty("link");
    expect(result).not.toHaveProperty("chat");
  });
});
