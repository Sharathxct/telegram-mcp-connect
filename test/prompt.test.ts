import { test, expect, describe } from "bun:test";
import { maskedLine } from "../src/prompt.js";

describe("maskedLine", () => {
  test("shows one bullet per typed character", () => {
    expect(maskedLine("  api_hash: ", 5)).toBe("\x1b[2K\x1b[G  api_hash: •••••");
  });

  test("keeps the prompt visible and leaks nothing typed", () => {
    const line = maskedLine("  api_id:   ", 8);
    expect(line).toContain("api_id:");
    expect(line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")).toBe("  api_id:   ••••••••");
  });

  test("redraws the whole line so backspace shrinks the bullets", () => {
    expect(maskedLine("p: ", 3)).toContain("•••");
    expect(maskedLine("p: ", 2)).toContain("••");
    expect(maskedLine("p: ", 0)).not.toContain("•");
  });

  test("never emits negative repeats", () => {
    expect(maskedLine("p: ", -1)).not.toContain("•");
  });
});
