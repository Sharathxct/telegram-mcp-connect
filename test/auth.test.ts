import { describe, expect, test } from "bun:test";
import { existingAccountGuard } from "../src/auth.js";

describe("existingAccountGuard", () => {
  test("reports retryable login errors without stopping GramJS retries", () => {
    const errors: string[] = [];
    const guard = existingAccountGuard((err) => errors.push(err.message));

    expect(guard.onError(new Error("PHONE_CODE_INVALID"))).toBeUndefined();
    expect(errors).toEqual(["PHONE_CODE_INVALID"]);
    expect(guard.signUpWasRequired()).toBe(false);
  });

  test("stops before GramJS can create a new Telegram account", async () => {
    const errors: string[] = [];
    const guard = existingAccountGuard((err) => errors.push(err.message));

    await expect(guard.firstAndLastNames()).rejects.toThrow("only connects existing Telegram accounts");
    expect(guard.signUpWasRequired()).toBe(true);
    await expect(guard.onError(new Error("signup blocked"))).resolves.toBe(true);
    expect(errors).toEqual([]);
  });
});
