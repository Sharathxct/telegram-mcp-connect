import { describe, expect, test } from "bun:test";
import {
  optionalBoolean,
  optionalPositiveInteger,
  optionalString,
  requiredString,
} from "../src/tools/validate.js";

describe("tool argument validation", () => {
  test("accepts and trims strings", () => {
    expect(requiredString({ chat: "  Product  " }, "chat")).toBe("Product");
    expect(optionalString({ query: "  launch " }, "query")).toBe("launch");
    expect(optionalString({}, "query")).toBeUndefined();
  });

  test("rejects missing, blank and incorrectly typed strings", () => {
    expect(() => requiredString({}, "chat")).toThrow("`chat` must be a non-empty string.");
    expect(() => requiredString({ chat: " " }, "chat")).toThrow("`chat` must be a non-empty string.");
    expect(() => optionalString({ chat: 42 }, "chat")).toThrow("`chat` must be a string.");
  });

  test("accepts only positive safe integers", () => {
    expect(optionalPositiveInteger({ limit: 10 }, "limit")).toBe(10);
    expect(optionalPositiveInteger({}, "limit")).toBeUndefined();
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "10"]) {
      expect(() => optionalPositiveInteger({ limit: value }, "limit")).toThrow(
        "`limit` must be a positive integer.",
      );
    }
  });

  test("accepts only real booleans", () => {
    expect(optionalBoolean({ unreadOnly: false }, "unreadOnly")).toBe(false);
    expect(optionalBoolean({}, "unreadOnly")).toBeUndefined();
    expect(() => optionalBoolean({ unreadOnly: "false" }, "unreadOnly")).toThrow(
      "`unreadOnly` must be a boolean.",
    );
  });
});
