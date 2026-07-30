import { test, expect, describe } from "bun:test";
import { buildPeerIndex, lookupPeer, peerKey } from "../src/peers.js";

const users = [
  { className: "User", id: 100000001, firstName: "Alex", lastName: "Rivera", username: "alex_rivera" },
  { className: "User", id: 100000002, firstName: "Sam" },
];
const chats = [
  { className: "Channel", id: 1234567890, title: "Product Updates", username: "product_updates" },
  { className: "Chat", id: 4000000002, title: "Acme <> Contoso" },
];

describe("buildPeerIndex", () => {
  test("indexes users and chats under distinct keys", () => {
    const index = buildPeerIndex(users, chats);
    expect(index.get("user:100000001")?.name).toBe("Alex Rivera");
    expect(index.get("channel:1234567890")?.name).toBe("Product Updates");
    expect(index.get("chat:4000000002")?.name).toBe("Acme <> Contoso");
  });

  test("gives channels the -100 form that t.me/c links need", () => {
    const index = buildPeerIndex(users, chats);
    expect(index.get("channel:1234567890")?.linkId).toBe("-1001234567890");
    expect(index.get("chat:4000000002")?.linkId).toBeUndefined();
    expect(index.get("user:100000001")?.linkId).toBeUndefined();
  });

  test("tolerates missing arrays", () => {
    expect(buildPeerIndex().size).toBe(0);
    expect(buildPeerIndex(undefined, chats).size).toBe(2);
  });
});

describe("peerKey", () => {
  test("maps each Peer variant to its key", () => {
    expect(peerKey({ className: "PeerUser", userId: 100000001 })).toBe("user:100000001");
    expect(peerKey({ className: "PeerChannel", channelId: 1234567890 })).toBe("channel:1234567890");
    expect(peerKey({ className: "PeerChat", chatId: 4000000002 })).toBe("chat:4000000002");
  });

  test("returns null for anything unrecognised", () => {
    expect(peerKey(undefined)).toBeNull();
    expect(peerKey({})).toBeNull();
  });
});

describe("lookupPeer", () => {
  test("resolves a message's fromId to a real name", () => {
    const index = buildPeerIndex(users, chats);
    expect(lookupPeer(index, { className: "PeerUser", userId: 100000001 })?.name).toBe("Alex Rivera");
  });

  test("returns undefined when the peer is absent from the response", () => {
    const index = buildPeerIndex(users, chats);
    expect(lookupPeer(index, { className: "PeerUser", userId: 999 })).toBeUndefined();
  });
});
