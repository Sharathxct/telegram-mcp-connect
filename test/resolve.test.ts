import { test, expect, describe } from "bun:test";
import { Api } from "teleproto";
import bigInt from "big-integer";
import { describeEntity, isSelfAlias, markedId, rankDialogs, scoreTitle, type DialogRef } from "../src/resolve.js";

const dialog = (title: string, id = "1", username?: string): DialogRef => ({
  id,
  title,
  ...(username ? { username } : {}),
  entity: { title },
});

const channel = (id: number, title: string, username?: string) =>
  new Api.Channel({
    id: bigInt(id),
    title,
    ...(username ? { username } : {}),
    photo: new Api.ChatPhotoEmpty(),
    date: 0,
  });

const basicChat = (id: number, title: string) =>
  new Api.Chat({
    id: bigInt(id),
    title,
    photo: new Api.ChatPhotoEmpty(),
    participantsCount: 2,
    date: 0,
    version: 0,
  });

describe("scoreTitle", () => {
  test("ranks exact over prefix over substring", () => {
    expect(scoreTitle("Acme <> Contoso", "Acme <> Contoso")).toBe(100);
    expect(scoreTitle("Acme <> Contoso", "acme")).toBe(80);
    expect(scoreTitle("Acme <> Contoso", "contoso")).toBe(60);
  });

  test("ignores punctuation and case, which is how people actually type chat names", () => {
    expect(scoreTitle("Acme <> Contoso", "acme contoso")).toBe(100);
    expect(scoreTitle("Contoso <> Initech SDKs", "contoso initech sdks")).toBe(100);
  });

  test("keeps non-Latin chat names searchable", () => {
    expect(scoreTitle("दोस्तों का समूह", "दोस्तों")).toBe(80);
    expect(scoreTitle("Продуктовая команда", "команда")).toBe(60);
    expect(scoreTitle("مشروع ألفا", "مشروع ألفا")).toBe(100);
  });

  test("matches when all tokens appear out of order", () => {
    expect(scoreTitle("Contoso <> Initech SDKs", "initech contoso")).toBe(40);
  });

  test("returns 0 for no match and for empty input", () => {
    expect(scoreTitle("Acme <> Contoso", "umbrella")).toBe(0);
    expect(scoreTitle("Acme <> Contoso", "")).toBe(0);
    expect(scoreTitle("", "acme")).toBe(0);
  });

  test("refuses to partial-match very short queries", () => {
    expect(scoreTitle("MetEngine", "me")).toBe(0);
    expect(scoreTitle("Acme <> Contoso", "ac")).toBe(0);
    expect(scoreTitle("Backend Team", "back")).toBe(80);
  });

  test("still matches a genuinely short title exactly", () => {
    expect(scoreTitle("Mom", "mom")).toBe(100);
    expect(scoreTitle("QA", "qa")).toBe(100);
  });
});

describe("isSelfAlias", () => {
  test("recognises the ways people refer to Saved Messages", () => {
    for (const alias of ["me", "Me", "self", "myself", "saved", "Saved Messages", "my saved messages"]) {
      expect(isSelfAlias(alias)).toBe(true);
    }
  });

  test("does not claim ordinary chat names", () => {
    for (const name of ["MetEngine", "Backend Team", "meeting notes", "saved links"]) {
      expect(isSelfAlias(name)).toBe(false);
    }
  });
});

describe("rankDialogs", () => {
  const dialogs = [
    dialog("Backend Team", "-4000000001"),
    dialog("Acme <> Contoso", "-4000000002"),
    dialog("Contoso Announcements", "-1001234567890"),
    dialog("Contoso Design", "-4000000003"),
  ];

  test("puts the best match first", () => {
    expect(rankDialogs(dialogs, "acme")[0]?.title).toBe("Acme <> Contoso");
    expect(rankDialogs(dialogs, "backend")[0]?.title).toBe("Backend Team");
  });

  test("returns every candidate for an ambiguous query", () => {
    const matches = rankDialogs(dialogs, "contoso");
    expect(matches).toHaveLength(3);
  });

  test("excludes non-matches entirely", () => {
    expect(rankDialogs(dialogs, "umbrella")).toEqual([]);
  });

  test("matches on username too", () => {
    const withUser = [dialog("Some Channel", "1", "product_updates")];
    expect(rankDialogs(withUser, "product_updates")[0]?.title).toBe("Some Channel");
  });
});

describe("markedId", () => {
  test("returns ids in the same marked form tg_list_chats reports", () => {
    expect(markedId(channel(1234567890, "Product Updates"))).toBe("-1001234567890");
    expect(markedId(basicChat(4000000002, "Acme <> Contoso"))).toBe("-4000000002");
    expect(markedId(new Api.User({ id: bigInt(100000001), firstName: "Alex" }))).toBe("100000001");
  });

  test("returns undefined rather than throwing on junk", () => {
    expect(markedId(undefined)).toBeUndefined();
    expect(markedId({})).toBeUndefined();
  });
});

describe("describeEntity", () => {
  test("gives channels an id that builds a t.me/c permalink", () => {
    expect(describeEntity(channel(1234567890, "Product Updates"))).toEqual({
      id: "-1001234567890",
      title: "Product Updates",
    });
  });

  test("carries a username through when the entity has one", () => {
    expect(describeEntity(channel(1234567890, "Product Updates", "product_updates")).username).toBe(
      "product_updates",
    );
  });

  test("basic groups get a negative id, which correctly yields no public permalink", () => {
    expect(describeEntity(basicChat(4000000002, "Acme <> Contoso")).id).toBe("-4000000002");
  });
});
