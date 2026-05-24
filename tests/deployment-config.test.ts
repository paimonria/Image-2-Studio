import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("deployment configuration guardrails", () => {
  it("keeps production compose pull-based for web and worker containers", () => {
    const compose = read("docker-compose.yml");

    assert.match(compose, /image:\s+\$\{IMAGE_NAME:-ghcr\.io\/pairmeng\/image-2-studio\}:\$\{IMAGE_TAG:-latest\}/);
    assert.equal((compose.match(/pull_policy:\s+always/g) ?? []).length, 2);
    assert.match(compose, /IMAGE_PROCESS_ROLE:\s+web/);
    assert.match(compose, /IMAGE_PROCESS_ROLE:\s+worker/);
  });

  it("injects the release version into Docker images built by GitHub Actions", () => {
    const dockerfile = read("Dockerfile");
    const workflow = read(".github/workflows/docker-image.yml");

    assert.match(dockerfile, /ARG APP_VERSION=dev/);
    assert.match(dockerfile, /ENV APP_VERSION=\$\{APP_VERSION\}/);
    assert.match(workflow, /echo "version=\$\{version\}" >> "\$\{GITHUB_OUTPUT\}"/);
    assert.match(workflow, /APP_VERSION=\$\{\{ steps\.meta\.outputs\.version \}\}/);
  });

  it("uses a noninteractive lint command", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

    assert.equal(packageJson.scripts?.lint, "eslint .");
    assert.match(packageJson.scripts?.verify ?? "", /pnpm run lint/);
    assert.match(packageJson.scripts?.verify ?? "", /pnpm run test:jobs/);
    assert.match(packageJson.scripts?.verify ?? "", /pnpm run build:worker/);
    assert.match(packageJson.scripts?.verify ?? "", /pnpm run build/);
  });
});
