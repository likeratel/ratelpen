import { expect, test } from "@playwright/test";
import {
  drag,
  expectInk,
  expectNoInk,
  inkAlphaAt,
  openOverlay,
  reportedContent,
  sendClearCommand,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await openOverlay(page);
});

test("drawing with the pen leaves ink and undo removes it", async ({
  page,
}) => {
  await expectNoInk(page);
  await drag(page, { x: 200, y: 200 }, { x: 420, y: 300 });
  await expectInk(page);

  await page.keyboard.press("ControlOrMeta+z");
  await expectNoInk(page);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expectInk(page);
});

test("R selects the rectangle tool and draws an outline", async ({ page }) => {
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: "Rectangle" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await drag(page, { x: 300, y: 200 }, { x: 500, y: 360 });
  await expectInk(page);
  expect(await inkAlphaAt(page, 300, 280)).toBeGreaterThan(0);
  expect(await inkAlphaAt(page, 400, 200)).toBeGreaterThan(0);
  expect(await inkAlphaAt(page, 400, 280)).toBe(0);
});

test("the eraser removes a whole stroke in one drag", async ({ page }) => {
  await drag(page, { x: 200, y: 300 }, { x: 600, y: 300 });
  await expectInk(page);

  await page.keyboard.press("e");
  await drag(page, { x: 400, y: 200 }, { x: 400, y: 400 });
  await expectNoInk(page);

  // One erase drag is one undo step.
  await page.keyboard.press("ControlOrMeta+z");
  await expectInk(page);
});

test("typing text does not trigger tool shortcuts", async ({ page }) => {
  await page.keyboard.press("t");
  await page.mouse.click(300, 300);
  const editor = page.getByRole("textbox", { name: "Text" });
  await expect(editor).toBeFocused();

  await page.keyboard.type("pe");
  await expect(editor).toHaveValue("pe");
  await expect(page.getByRole("button", { name: "Text" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.keyboard.press("Enter");
  await expect(editor).toBeHidden();
  await expectInk(page);
});

test("Escape cancels text, and an empty box is discarded", async ({ page }) => {
  await page.keyboard.press("t");
  await page.mouse.click(300, 300);
  await page.keyboard.type("draft");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Text" })).toBeHidden();
  await expect(page.getByRole("toolbar")).toBeVisible();
  await expectNoInk(page);
});

test("Escape leaves draw mode, hiding the toolbar but keeping the ink", async ({
  page,
}) => {
  await drag(page, { x: 200, y: 200 }, { x: 400, y: 260 });
  await expectInk(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar")).toBeHidden();
  await expectInk(page);
});

test("the board button cycles a background behind the ink", async ({
  page,
}) => {
  await page.keyboard.press("b");
  await expect(page.getByTestId("board")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.keyboard.press("b");
  await expect(page.getByTestId("board")).toHaveCSS(
    "background-color",
    "rgb(17, 17, 19)",
  );
  await page.keyboard.press("b");
  await expect(page.getByTestId("board")).toHaveCount(0);
});

test("capturing to the clipboard reports success", async ({ page }) => {
  await page.getByRole("button", { name: "Copy screenshot" }).click();
  await expect(page.getByText("Copied to clipboard")).toBeVisible();
  await expect(page.getByRole("toolbar")).toBeVisible();
});

test("spotlight follows the cursor", async ({ page }) => {
  await page.keyboard.press("s");
  await page.mouse.move(500, 400);
  await expect(page.getByTestId("spotlight")).toBeVisible();
  await page.keyboard.press("s");
  await expect(page.getByTestId("spotlight")).toHaveCount(0);
});

test("fading ink disappears on its own", async ({ page }) => {
  await page.keyboard.press("f");
  await expect(
    page.getByRole("button", { name: "Fading ink" }),
  ).toHaveAttribute("aria-pressed", "true");
  await drag(page, { x: 200, y: 200 }, { x: 400, y: 260 });
  await expectInk(page);
  // Default fade time is 5 s.
  await expect
    .poll(() => inkAlphaAt(page, 300, 230), { timeout: 8000 })
    .toBe(0);
  await expectNoInk(page);
});

test("reports content changes and obeys the clear command", async ({
  page,
}) => {
  await expect.poll(() => reportedContent(page)).toBe(false);
  await drag(page, { x: 200, y: 200 }, { x: 400, y: 260 });
  await expect.poll(() => reportedContent(page)).toBe(true);

  await sendClearCommand(page);
  await expectNoInk(page);
  await expect.poll(() => reportedContent(page)).toBe(false);
});

test("leaving draw mode in the middle of a drag drops the stroke", async ({
  page,
}) => {
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 8 });
  // The core turns the window click-through here, so the pointerup may be lost.
  await page.evaluate(() =>
    window.__ratelpenFake?.setSession({ active: false }),
  );
  await expect(page.getByRole("toolbar")).toBeHidden();
  await page.mouse.up();

  await page.evaluate(() =>
    window.__ratelpenFake?.setSession({ active: true }),
  );
  await expect(page.getByRole("toolbar")).toBeVisible();
  await expectNoInk(page);

  // The next stroke starts normally and the toolbar takes clicks again.
  await drag(page, { x: 200, y: 400 }, { x: 420, y: 460 });
  await expectInk(page);
  await page.getByRole("button", { name: "Rectangle" }).click();
  await expect(page.getByRole("button", { name: "Rectangle" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("Space selects one stroke and D deletes only that one", async ({
  page,
}) => {
  await drag(page, { x: 200, y: 200 }, { x: 500, y: 200 });
  await drag(page, { x: 200, y: 400 }, { x: 500, y: 400 });
  expect(await inkAlphaAt(page, 350, 200)).toBeGreaterThan(0);
  expect(await inkAlphaAt(page, 350, 400)).toBeGreaterThan(0);

  await page.keyboard.down("Space");
  await page.mouse.click(350, 200);
  await page.keyboard.up("Space");
  await page.keyboard.press("d");

  await expect.poll(() => inkAlphaAt(page, 350, 200)).toBe(0);
  expect(await inkAlphaAt(page, 350, 400)).toBeGreaterThan(0);

  // One undo brings the deleted stroke back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => inkAlphaAt(page, 350, 200)).toBeGreaterThan(0);
});

test("Space+drag moves the selected stroke and Esc only deselects", async ({
  page,
}) => {
  await drag(page, { x: 200, y: 200 }, { x: 500, y: 200 });

  await page.keyboard.down("Space");
  await drag(page, { x: 350, y: 200 }, { x: 350, y: 320 });
  await page.keyboard.up("Space");

  await expect.poll(() => inkAlphaAt(page, 350, 320)).toBeGreaterThan(0);
  expect(await inkAlphaAt(page, 350, 200)).toBe(0);

  // The first Esc drops the selection; draw mode stays on.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar")).toBeVisible();
  await page.keyboard.press("d");
  expect(await inkAlphaAt(page, 350, 320)).toBeGreaterThan(0);
});

test("a rubber band selects several strokes and Delete removes them", async ({
  page,
}) => {
  await drag(page, { x: 200, y: 200 }, { x: 400, y: 200 });
  await drag(page, { x: 200, y: 260 }, { x: 400, y: 260 });
  await drag(page, { x: 200, y: 500 }, { x: 400, y: 500 });

  await page.keyboard.down("Space");
  await drag(page, { x: 150, y: 150 }, { x: 450, y: 300 });
  await page.keyboard.up("Space");
  await page.keyboard.press("Delete");

  await expect.poll(() => inkAlphaAt(page, 300, 200)).toBe(0);
  expect(await inkAlphaAt(page, 300, 260)).toBe(0);
  expect(await inkAlphaAt(page, 300, 500)).toBeGreaterThan(0);
});

test("Space types a space while entering text", async ({ page }) => {
  await page.keyboard.press("t");
  await page.mouse.click(300, 300);
  const editor = page.getByRole("textbox", { name: "Text" });
  await expect(editor).toBeFocused();

  await page.keyboard.type("a b");
  await expect(editor).toHaveValue("a b");
});

test("drawing again drops the selection, and D then deletes nothing", async ({
  page,
}) => {
  await drag(page, { x: 200, y: 200 }, { x: 500, y: 200 });
  await page.keyboard.down("Space");
  await page.mouse.click(350, 200);
  await page.keyboard.up("Space");

  await drag(page, { x: 200, y: 400 }, { x: 500, y: 400 });
  await page.keyboard.press("d");

  expect(await inkAlphaAt(page, 350, 200)).toBeGreaterThan(0);
  expect(await inkAlphaAt(page, 350, 400)).toBeGreaterThan(0);
});

test("moving several strokes is one undo step, and the bin still clears all", async ({
  page,
}) => {
  await drag(page, { x: 200, y: 200 }, { x: 400, y: 200 });
  await drag(page, { x: 200, y: 260 }, { x: 400, y: 260 });

  await page.keyboard.down("Space");
  await drag(page, { x: 150, y: 150 }, { x: 450, y: 300 });
  await drag(page, { x: 300, y: 200 }, { x: 300, y: 400 });
  await page.keyboard.up("Space");
  await expect.poll(() => inkAlphaAt(page, 300, 400)).toBeGreaterThan(0);
  expect(await inkAlphaAt(page, 300, 460)).toBeGreaterThan(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => inkAlphaAt(page, 300, 200)).toBeGreaterThan(0);
  expect(await inkAlphaAt(page, 300, 260)).toBeGreaterThan(0);
  expect(await inkAlphaAt(page, 300, 400)).toBe(0);

  // The toolbar bin clears the screen even while something is selected.
  await page.keyboard.down("Space");
  await page.mouse.click(300, 200);
  await page.keyboard.up("Space");
  await page.getByRole("button", { name: /^Clear/ }).click();
  await expectNoInk(page);
});
