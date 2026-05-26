import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSessionExpiredMessage,
  isSessionExpiredError
} from "../src/components/studio/utils/session-expiry";

describe("session expiry helpers", () => {
  it("detects localized session expired errors", () => {
    assert.equal(isSessionExpiredError(new Error("Your session expired. Please sign in again.")), true);
    assert.equal(isSessionExpiredError("登录已过期，请重新登录。"), true);
    assert.equal(isSessionExpiredError(new Error("Generation failed.")), false);
    assert.equal(isSessionExpiredError(null), false);
  });

  it("returns localized session expired messages", () => {
    assert.equal(getSessionExpiredMessage("en"), "Your session expired. Please sign in again.");
    assert.equal(getSessionExpiredMessage("zh"), "登录已过期，请重新登录。");
  });
});
