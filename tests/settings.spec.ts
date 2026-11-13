import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?view=settings");
  await expect(
    page.getByRole("heading", { name: "ratelpen Settings" }),
  ).toBeVisible();
});

test("records a shortcut and saves the settings", async ({ page }) => {
  const field = page.getByLabel("Toggle draw mode", { exact: true });
  await expect(field).toHaveValue("Alt+Tab");

  await field.click();
  await page.keyboard.press("Alt+Shift+KeyK");
  await expect(field).toHaveValue("Alt+Shift+K");

  await page.getByLabel("Disappear after (seconds)").fill("8");
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
});

test("rejects a shortcut without a modifier", async ({ page }) => {
  const field = page.getByLabel("Clear all screens", { exact: true });
  await field.click();
  await page.keyboard.press("KeyK");
  await expect(field).toHaveValue("Alt+Shift+C");
  await expect(page.getByRole("alert")).toContainText(
    "Add Command, Control or Option/Alt",
  );
});

test("disables a shortcut with the clear button", async ({ page }) => {
  await page.getByRole("button", { name: "Disable Toggle spotlight" }).click();
  await expect(
    page.getByLabel("Toggle spotlight", { exact: true }),
  ).toHaveValue("");
});

test("blocks saving out-of-range values", async ({ page }) => {
  await page.getByLabel("Radius (px)").fill("5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Fix the highlighted fields before saving."),
  ).toBeVisible();
  await expect(
    page.getByText("Enter a whole number from 20 to 300."),
  ).toBeVisible();
});

test("shows the core's error when a shortcut is unavailable", async ({
  page,
}) => {
  const field = page.getByLabel("Toggle draw mode", { exact: true });
  await field.click();
  await page.keyboard.press("ControlOrMeta+KeyQ");
  await expect(field).toHaveValue("CmdOrCtrl+Q");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "already used by another app",
  );
});
