import { test, expect, describe } from "bun:test";
import { maskedLine, PromptAborted } from "../src/prompt.js";

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

describe("PromptAborted", () => {
  test("is throwable and identifiable so retry loops can exit", () => {
    const err = new PromptAborted();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PromptAborted");
  });

  test("a validation retry loop terminates when input aborts", async () => {
    // Ctrl+C used to resolve prompts with "", so `while (!apiId)` spun forever
    // re-printing the prompt against a closed stream.
    const askStub = async (): Promise<string> => {
      throw new PromptAborted();
    };

    let prompts = 0;
    const loop = async () => {
      let apiId = 0;
      while (!apiId) {
        prompts++;
        if (prompts > 50) throw new Error("loop did not terminate");
        const raw = Number(await askStub());
        if (Number.isInteger(raw) && raw > 0) apiId = raw;
      }
      return apiId;
    };

    await expect(loop()).rejects.toBeInstanceOf(PromptAborted);
    expect(prompts).toBe(1);
  });
});
