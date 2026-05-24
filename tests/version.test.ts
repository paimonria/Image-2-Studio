import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { APP_PACKAGE_VERSION, getAppVersion } from "../src/lib/version";

describe("application version metadata", () => {
  it("keeps the package version fallback in sync with package.json", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version?: string };

    assert.equal(APP_PACKAGE_VERSION, packageJson.version);
  });

  it("derives release tags from the same package version source", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version?: string };
    const workflow = readFileSync(".github/workflows/docker-image.yml", "utf8");
    const releaseTag = `v${packageJson.version}`;

    assert.match(packageJson.version ?? "", /^\d+\.\d+\.\d+$/);
    assert.match(releaseTag, /^v\d+\.\d+\.\d+$/);
    assert.match(workflow, /version="\$\{GITHUB_REF_NAME\}"/);
    assert.match(workflow, /APP_VERSION=\$\{\{ steps\.meta\.outputs\.version \}\}/);
  });

  it("prefers explicit deployment version values before package metadata", () => {
    assert.equal(getAppVersion({ APP_VERSION: "v9.0.0", IMAGE_TAG: "v8.0.0", npm_package_version: "1.0.0" } as NodeJS.ProcessEnv), "v9.0.0");
    assert.equal(getAppVersion({ IMAGE_TAG: "v8.0.0", npm_package_version: "1.0.0" } as NodeJS.ProcessEnv), "v8.0.0");
    assert.equal(getAppVersion({ npm_package_version: "1.0.0" } as NodeJS.ProcessEnv), "1.0.0");
    assert.equal(getAppVersion({} as NodeJS.ProcessEnv), APP_PACKAGE_VERSION);
  });
});
