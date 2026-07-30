import { test, expect, describe } from "bun:test";
import { isCompleteConfig, parseEnvFile } from "../src/config.js";

describe("parseEnvFile", () => {
  test("reads plain key=value pairs", () => {
    expect(parseEnvFile("TG_API_ID=12345\nTG_API_HASH=abc")).toEqual({
      TG_API_ID: "12345",
      TG_API_HASH: "abc",
    });
  });

  test("strips the trailing \\r from a CRLF file", () => {

    const parsed = parseEnvFile("TG_SESSION=1AgAOMTQ5\r\nTG_API_ID=42\r\n");
    expect(parsed.TG_SESSION).toBe("1AgAOMTQ5");
    expect(parsed.TG_API_ID).toBe("42");
  });

  test("strips surrounding quotes", () => {
    expect(parseEnvFile(`A="quoted"\nB='single'`)).toEqual({ A: "quoted", B: "single" });
  });

  test("ignores comments, blanks and malformed lines", () => {
    expect(parseEnvFile("# comment\n\nnot-a-pair\nGOOD=1")).toEqual({ GOOD: "1" });
  });

  test("keeps an empty value as empty rather than dropping the key", () => {
    expect(parseEnvFile("TG_SESSION=")).toEqual({ TG_SESSION: "" });
  });

  test("does not split on '=' inside the value", () => {
    expect(parseEnvFile("TG_SESSION=abc=def==").TG_SESSION).toBe("abc=def==");
  });
});

describe("isCompleteConfig", () => {
  test("requires all three credentials", () => {
    expect(isCompleteConfig({ apiId: 1, apiHash: "h", session: "s", allowWrite: false })).toBe(true);
    expect(isCompleteConfig({ apiId: 1, apiHash: "h", allowWrite: false })).toBe(false);
    expect(isCompleteConfig({ apiId: 1, session: "s", allowWrite: false })).toBe(false);
    expect(isCompleteConfig({})).toBe(false);
  });
});
