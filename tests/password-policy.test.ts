import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePasswordChangeInput } from "../src/lib/server/password-policy";

describe("password change validation", () => {
  it("requires the current password", () => {
    const result = parsePasswordChangeInput({ currentPassword: "", newPassword: "new-password" });

    assert.equal(result.ok, false);
  });

  it("requires a new password of at least 8 characters", () => {
    const result = parsePasswordChangeInput({ currentPassword: "old-password", newPassword: "short" });

    assert.equal(result.ok, false);
  });

  it("normalizes valid password change input", () => {
    const result = parsePasswordChangeInput({ currentPassword: "old-password", newPassword: "new-password" });

    assert.deepEqual(result, {
      ok: true,
      input: {
        currentPassword: "old-password",
        newPassword: "new-password"
      }
    });
  });
});

