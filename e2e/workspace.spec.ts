import { expect, test } from "@playwright/test";

test("guest design survives reload, proposals require review, and account adoption preserves it", async ({
  page,
}) => {
  await page.goto("/chat");
  const composer = page.getByRole("textbox", { name: "Your message" });
  await composer.fill("Design 1 router, 1 switch and 2 PCs with VLANs");
  await composer.press("Enter");
  await expect(page).toHaveURL(/\/chat\/cht/);
  // On phones the canvas opens as an overlay; close it to continue chatting.
  const closeCanvas = page.getByTitle("Close panel");
  await expect(page.getByText("Design saved", { exact: true })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 1280)
    await expect(closeCanvas).toBeVisible();
  await expect(closeCanvas).toBeVisible();
  await closeCanvas.click();
  const chatUrl = page.url();
  await page.reload();
  await expect(
    page.getByText("Version history, comparison & restore", { exact: false }),
  ).toBeVisible();
  await expect(closeCanvas).toBeVisible();
  await closeCanvas.click();
  await expect(
    page.getByText("Version history, comparison & restore", { exact: false }),
  ).toBeVisible();
  // A failed canvas save remains visible and can be retried without losing the layout.
  await page
    .getByRole("button", { name: "Toggle canvas", exact: true })
    .click();
  let failSave = true;
  await page.route("**/api/v1/conversations/*", async (route) => {
    if (route.request().method() === "PATCH" && failSave) {
      failSave = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "STORE_BUSY", message: "Temporary storage failure" },
        }),
      });
    } else await route.continue();
  });
  const failedSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" && response.status() === 503,
  );
  await page.getByTitle("Radial Core-Edge Layout").click();
  await failedSave;
  await expect(closeCanvas).toBeVisible();
  await closeCanvas.click();
  await expect(
    page.getByText("Changes are not saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByText("Design saved", { exact: true })).toBeVisible();
  await page.unroute("**/api/v1/conversations/*");
  await composer.fill("Add 1 server");
  await composer.press("Enter");
  await expect(
    page.getByText("Review AI changes before applying", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept & apply changes" }).click();
  await expect(
    page.getByRole("button", { name: "Accept & apply changes" }),
  ).toHaveCount(0);
  await page
    .getByText("Version history, comparison & restore", { exact: false })
    .click();
  await page
    .getByRole("combobox", { name: "Baseline revision" })
    .selectOption("1");
  await page
    .getByRole("button", { name: "Restore revision & keep history" })
    .click();
  await expect(
    page.getByText("No differences from the selected revision."),
  ).toBeVisible();
  await page.goto("/auth");
  await page
    .getByRole("button", { name: "Need an account? Register now" })
    .click();
  await page.getByLabel("Full name").fill("Lab Engineer");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`engineer-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("LabPassword123!");
  const registration = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/auth/register"),
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  expect((await registration).status()).toBe(201);
  await expect(page).toHaveURL(/\/chat$/);
  await page.goto(chatUrl);
  await page.reload();
  await expect(closeCanvas).toBeVisible();
  await closeCanvas.click();
  await expect(
    page.getByText("Version history, comparison & restore", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Export Packet Tracer", exact: true })
    .click();
  const exportDialog = page.getByRole("dialog", {
    name: "Export network design",
  });
  await expect(exportDialog).toBeVisible();
  const downloadButton = exportDialog.getByRole("button", {
    name: "Download Packet Tracer Pack",
    exact: true,
  });
  await expect(downloadButton).toBeDisabled();
  await exportDialog.getByRole("checkbox").check();
  const download = page.waitForEvent("download");
  await downloadButton.click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: `test-results/workspace-${page.viewportSize()?.width}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() => localStorage.getItem("nettopo:jwt")),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("command dialog restores focus, traps Tab, and supports Escape", async ({
  page,
}) => {
  await page.goto("/chat");
  await expect(
    page.getByRole("textbox", { name: "Your message" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Your message" }).focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", {
    name: "Search conversations and commands",
  });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 20; i++) await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("failed first message preserves the draft and retries in the same conversation", async ({
  page,
}) => {
  await page.goto("/chat");
  const composer = page.getByRole("textbox", { name: "Your message" });
  let fail = true;
  await page.route("**/api/v1/conversations/*/messages", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "TEMPORARY", message: "Please retry" },
        }),
      });
    } else await route.continue();
  });
  await composer.fill("Design 1 router, 1 switch and 2 PCs");
  await composer.press("Enter");
  await expect(composer).toHaveValue("Design 1 router, 1 switch and 2 PCs");
  await expect(page).toHaveURL(/\/chat\/cht/);
  const url = page.url();
  await composer.press("Enter");
  await expect(page.getByText("Design saved", { exact: true })).toBeVisible();
  expect(page.url()).toBe(url);
});
