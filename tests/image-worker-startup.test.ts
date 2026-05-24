import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getImageWorkerSchemaWaitConfig, isMissingImageJobTableError } from "../src/lib/image-worker-startup";

describe("image worker startup policy", () => {
  it("recognizes missing ImageJob table errors as retryable during startup", () => {
    assert.equal(isMissingImageJobTableError(new Error("The table `public.ImageJob` does not exist in the current database.")), true);
    assert.equal(isMissingImageJobTableError(new Error("relation \"ImageJob\" does not exist")), true);
    assert.equal(isMissingImageJobTableError(new Error("no such table: ImageJob")), true);
    assert.equal(isMissingImageJobTableError(new Error("P2021: The table `ImageJob` does not exist")), true);
  });

  it("does not classify unrelated startup errors as missing schema", () => {
    assert.equal(isMissingImageJobTableError(new Error("Redis connection failed")), false);
    assert.equal(isMissingImageJobTableError(new Error("permission denied for table ImageJob")), false);
    assert.equal(isMissingImageJobTableError(new Error("The table `public.User` does not exist in the current database.")), false);
  });

  it("reuses migration retry env values for worker schema waiting", () => {
    assert.deepEqual(
      getImageWorkerSchemaWaitConfig({
        DB_MIGRATE_ATTEMPTS: "3",
        DB_MIGRATE_RETRY_SECONDS: "2"
      }),
      {
        attempts: 3,
        delayMs: 2000
      }
    );
  });

  it("falls back to safe defaults for invalid retry env values", () => {
    assert.deepEqual(
      getImageWorkerSchemaWaitConfig({
        DB_MIGRATE_ATTEMPTS: "0",
        DB_MIGRATE_RETRY_SECONDS: "nope"
      }),
      {
        attempts: 12,
        delayMs: 5000
      }
    );
  });
});
