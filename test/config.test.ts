import { test, expect, describe } from "bun:test";
import { isCompleteConfig } from "../src/config.js";

describe("isCompleteConfig", () => {
  test("requires all three credentials", () => {
    expect(isCompleteConfig({ apiId: 1, apiHash: "h", session: "s", allowWrite: false })).toBe(true);
    expect(isCompleteConfig({ apiId: 1, apiHash: "h", allowWrite: false })).toBe(false);
    expect(isCompleteConfig({ apiId: 1, session: "s", allowWrite: false })).toBe(false);
    expect(isCompleteConfig({})).toBe(false);
  });
});
