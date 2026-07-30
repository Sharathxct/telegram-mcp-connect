import { test, expect } from "bun:test";
import { VERSION } from "../src/version.js";
import pkg from "../package.json" with { type: "json" };

test("VERSION matches package.json so the MCP handshake never lies about its version", () => {
  expect(VERSION).toBe(pkg.version);
});
