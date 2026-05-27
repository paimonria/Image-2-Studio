import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "user-params-1",
  email: "params@example.com",
  role: "USER",
  disabled: false,
  jobMonitorClearedAt: null,
  jobMonitorFinishedClearedAt: null
};

const jobId = "job-params-1";
const promptText = "A configurable studio parameter smoke image";

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

function buildCatalog() {
  return {
    providers: [{
      provider: "openai",
      label: "OpenAI",
      configured: true,
      supportsCustomSize: true,
      baseUrlConfigured: true
    }],
    models: [{
      provider: "openai",
      modelId: "gpt-image-2",
      label: "GPT Image 2",
      description: "Parameter smoke-test model",
      capabilities: ["text-to-image", "image-to-image", "continue-edit"],
      defaultSize: "1024x1024",
      supportedSizes: ["1024x1024", "1536x1024", "1024x1536"],
      defaultAspectRatio: "3:4",
      supportedAspectRatios: ["1:1", "3:4", "4:3", "16:9"],
      defaultQuality: "medium",
      qualityOptions: ["low", "medium", "high"],
      inputFidelityOptions: ["high", "low"],
      supportsCustomSize: true
    }]
  };
}

async function mockParameterApi(page: Page, onCreate: (body: string) => void) {
  let loggedIn = false;

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

  await page.route((url) => url.pathname === "/api/images/catalog", (route) => fulfillJson(route, buildCatalog()));
  await page.route((url) => url.pathname === "/api/images/history", (route) => fulfillJson(route, {
    records: [],
    nextCursor: undefined
  }));
  await page.route((url) => url.pathname === "/api/images/batches", (route) => fulfillJson(route, { batches: [] }));
  await page.route((url) => url.pathname === "/api/images/projects", (route) => fulfillJson(route, { projects: [] }));
  await page.route((url) => url.pathname === "/api/images/templates", (route) => fulfillJson(route, { templates: [] }));
  await page.route((url) => url.pathname === "/api/images/jobs", (route) => fulfillJson(route, { jobs: [] }));
  await page.route((url) => url.pathname === `/api/images/jobs/${jobId}`, (route) => fulfillJson(route, {
    id: jobId,
    status: "running",
    provider: "openai",
    model: "gpt-image-2",
    mode: "text-to-image",
    prompt: promptText,
    createdAt: "2026-05-27T00:00:00.000Z",
    startedAt: "2026-05-27T00:00:01.000Z"
  }));

  await page.route((url) => url.pathname === "/api/images/create", (route) => {
    onCreate(route.request().postData() ?? "");
    return fulfillJson(route, { jobId, status: "pending" }, 202);
  });
}

async function signInAndOpenStudio(page: Page) {
  await page.goto("/");
  await page.getByTestId("auth-email").fill(user.email);
  await page.getByTestId("auth-password").fill("correct horse battery staple");
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("open-generation-studio")).toBeVisible();
  await page.getByTestId("open-generation-studio").click();
  await expect(page.getByTestId("prompt-input")).toBeVisible();
}

async function openParameterDrawerIfVisible(page: Page) {
  const drawerToggle = page.getByTestId("composer-drawer-toggle");
  if (await drawerToggle.isVisible()) {
    await drawerToggle.click();
    await expect(drawerToggle).toHaveAttribute("aria-expanded", "true");
  }
}

async function chooseGenerationParameters(page: Page) {
  await openParameterDrawerIfVisible(page);

  const aspectControl = page.locator(".quick-bar .spec-control").nth(0);
  await aspectControl.locator("button").click();
  await page.locator(".quick-menu-aspect button", { hasText: "16:9" }).click();
  await expect(aspectControl.locator("strong")).toHaveText("16:9");

  const resolutionControl = page.locator(".quick-bar .spec-control").nth(1);
  await resolutionControl.locator("button").click();
  await page.locator(".quick-menu-resolution button", { hasText: "4K" }).click();
  await expect(resolutionControl.locator("strong")).toContainText("4K");

  const qualityControl = page.locator(".quick-bar > .quick-control").nth(3);
  await qualityControl.locator("button").first().click();
  await page.locator(".quick-menu-quality button", { hasText: "high" }).click();
  await expect(qualityControl.locator("strong")).toHaveText("high");
}

function expectMultipartField(body: string, field: string, value: string) {
  expect(body).toMatch(new RegExp(`name="${field}"\\r?\\n\\r?\\n${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
}

async function submitAndAssertParameters(page: Page, getSubmittedBody: () => string) {
  await page.getByTestId("prompt-input").fill(promptText);
  await page.getByTestId("generate-submit").click();

  await expect.poll(getSubmittedBody).toContain('name="aspectRatio"');
  const body = getSubmittedBody();
  expectMultipartField(body, "aspectRatio", "16:9");
  expectMultipartField(body, "resolution", "4096");
  expectMultipartField(body, "size", "4096x2304");
  expectMultipartField(body, "quality", "high");
}

test("desktop generation parameters stay selected and are submitted", async ({ page }) => {
  let submittedBody = "";
  await mockParameterApi(page, (body) => {
    submittedBody = body;
  });

  await signInAndOpenStudio(page);
  await chooseGenerationParameters(page);
  await submitAndAssertParameters(page, () => submittedBody);
});

test.describe("mobile generation parameters", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("drawer parameters stay selected and are submitted", async ({ page }) => {
    let submittedBody = "";
    await mockParameterApi(page, (body) => {
      submittedBody = body;
    });

    await signInAndOpenStudio(page);
    await chooseGenerationParameters(page);
    await submitAndAssertParameters(page, () => submittedBody);
  });
});
