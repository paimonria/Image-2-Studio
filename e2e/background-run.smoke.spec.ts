import { expect, test, type Page, type Route } from "@playwright/test";

const createdAt = "2026-05-23T12:00:00.000Z";
const finishedAt = "2026-05-23T12:00:08.000Z";
const jobId = "job-smoke-1";
const user = {
  id: "user-smoke-1",
  email: "smoke@example.com",
  role: "USER",
  disabled: false,
  jobMonitorClearedAt: null,
  jobMonitorFinishedClearedAt: null
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

function buildJob(status: "pending" | "running" | "succeeded") {
  return {
    id: jobId,
    status,
    provider: "openai",
    model: "gpt-image-2",
    mode: "text-to-image",
    prompt: "A release smoke test image",
    createdAt,
    ...(status === "running" || status === "succeeded" ? { startedAt: createdAt } : {}),
    ...(status === "succeeded" ? { resultId: "image-smoke-1", imageUrl: "/generated/smoke.png", finishedAt } : {})
  };
}

async function mockBackgroundRunApi(page: Page) {
  let loggedIn = false;
  let jobCreated = false;
  let jobStatus: "pending" | "running" | "succeeded" = "pending";
  let jobDetailReads = 0;

  await page.route((url) => url.pathname === "/api/app/branding", (route) => fulfillJson(route, {
    siteTitle: "Image-2 Studio",
    faviconUrl: "",
    logoUrl: ""
  }));

  await page.route((url) => url.pathname === "/api/auth/me", (route) => fulfillJson(route, {
    user: loggedIn ? user : null,
    registrationOpen: true
  }));

  await page.route((url) => url.pathname === "/api/auth/login", (route) => {
    loggedIn = true;
    return fulfillJson(route, { user });
  });

  await page.route((url) => url.pathname === "/api/images/catalog", (route) => fulfillJson(route, {
    providers: [{
      provider: "openai",
      label: "OpenAI",
      configured: true,
      supportsCustomSize: false,
      baseUrlConfigured: false
    }],
    models: [{
      provider: "openai",
      modelId: "gpt-image-2",
      label: "GPT Image 2",
      description: "Smoke-test model",
      capabilities: ["text-to-image", "image-to-image", "continue-edit"],
      defaultSize: "1024x1024",
      supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
      defaultAspectRatio: "1:1",
      supportedAspectRatios: ["1:1", "3:4", "4:3"],
      defaultQuality: "medium",
      qualityOptions: ["low", "medium", "high"],
      inputFidelityOptions: ["high", "low"],
      supportsCustomSize: false
    }]
  }));

  await page.route((url) => url.pathname === "/api/images/history", (route) => fulfillJson(route, {
    records: [],
    nextCursor: undefined
  }));

  await page.route((url) => url.pathname === "/api/images/batches", (route) => fulfillJson(route, {
    batches: []
  }));

  await page.route((url) => url.pathname === "/api/images/projects", (route) => fulfillJson(route, {
    projects: []
  }));

  await page.route((url) => url.pathname === "/api/images/templates", (route) => fulfillJson(route, {
    templates: []
  }));

  await page.route((url) => url.pathname === "/api/images/jobs", (route) => fulfillJson(route, {
    jobs: jobCreated ? [buildJob(jobStatus)] : []
  }));

  await page.route((url) => url.pathname === `/api/images/jobs/${jobId}`, (route) => {
    jobDetailReads += 1;
    jobStatus = jobDetailReads === 1 ? "pending" : jobDetailReads === 2 ? "running" : "succeeded";
    return fulfillJson(route, buildJob(jobStatus));
  });

  await page.route((url) => url.pathname === "/api/images/create", (route) => {
    jobCreated = true;
    return fulfillJson(route, { jobId, status: "pending" }, 202);
  });
}

test("background run reaches the active job monitor without real provider calls", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await mockBackgroundRunApi(page);
  await page.goto("/");

  await page.getByTestId("auth-email").fill(user.email);
  await page.getByTestId("auth-password").fill("correct horse battery staple");
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("open-generation-studio")).toBeVisible();
  await page.getByTestId("open-generation-studio").click();

  await page.getByTestId("prompt-input").fill("A release smoke test image");
  await expect(page.getByTestId("generate-submit")).toBeEnabled();
  await page.getByTestId("generate-submit").click();

  await expect(page.getByTestId("background-run-panel")).toBeVisible();
  await page.getByTestId("send-background-run").click();

  await expect(page.getByTestId("job-monitor-toggle")).toBeVisible();
  await page.getByTestId("job-monitor-toggle").click();
  await expect(page.getByTestId("job-monitor-popover")).toBeVisible();

  const row = page.getByTestId("job-monitor-row").first();
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-job-status", /^(pending|running)$/);
  await expect(row).toHaveAttribute("data-job-status", "running");

  expect(consoleErrors).toEqual([]);
});
