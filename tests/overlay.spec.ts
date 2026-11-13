import { expect, test, type Page } from "@playwright/test";
import {
  drag,
  expectInk,
  expectNoInk,
  inkAlphaAt,
  inkPixels,
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

async function placeText(page: Page, text: string): Promise<void> {
  await page.keyboard.press("t");
  await page.mouse.click(300, 300);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Text" })).toBeHidden();
}

test("clicking a text with the text tool edits it in place", async ({
  page,
}) => {
  await placeText(page, "hello");
  const before = await inkPixels(page);

  await page.mouse.click(320, 315);
  const editor = page.getByRole("textbox", { name: "Text" });
  await expect(editor).toHaveValue("hello");
  // The original is not drawn underneath the editor.
  await expectNoInk(page);

  await page.keyboard.type(" there");
  await page.keyboard.press("Enter");
  await expect(editor).toBeHidden();
  await expect.poll(() => inkPixels(page)).toBeGreaterThan(before);

  // One undo brings back the text as it was before the edit.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => inkPixels(page)).toBe(before);
});

test("Space+double-click edits a text from another tool; Esc keeps it", async ({
  page,
}) => {
  await placeText(page, "hello");
  const before = await inkPixels(page);
  await page.keyboard.press("p");

  await page.keyboard.down("Space");
  await page.mouse.dblclick(320, 315);
  await page.keyboard.up("Space");
  const editor = page.getByRole("textbox", { name: "Text" });
  await expect(editor).toHaveValue("hello");

  await page.keyboard.type("zzz");
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect.poll(() => inkPixels(page)).toBe(before);
});

test("emptying a text while editing removes it", async ({ page }) => {
  await placeText(page, "hello");
  await page.mouse.click(320, 315);
  const editor = page.getByRole("textbox", { name: "Text" });
  await editor.fill("");
  await page.keyboard.press("Enter");
  await expect(editor).toBeHidden();
  await expectNoInk(page);
});

const sessionColor = (page: Page) =>
  page.evaluate(() => window.__ratelpenFake?.snapshot().session.color);
const spotlightOn = (page: Page) =>
  page.evaluate(() => window.__ratelpenFake?.snapshot().session.spotlight);

test("the colour picker takes a typed code and keeps favourites", async ({
  page,
}) => {
  await page.getByRole("button", { name: "More colours" }).click();
  const picker = page.getByRole("dialog", { name: "Colour picker" });
  await expect(picker).toBeVisible();

  const code = picker.getByRole("textbox", { name: /Colour code/ });
  await code.fill("0, 255, 136");
  await code.press("Enter");
  await expect.poll(() => sessionColor(page)).toBe("#00ff88");
  await expect(code).toHaveValue("#00ff88");
  await expect(picker.getByText("RGB 0, 255, 136")).toBeVisible();

  await picker.getByRole("button", { name: "Add to favourites" }).click();
  await expect(
    picker.getByRole("button", { name: "Use #00ff88" }),
  ).toBeVisible();

  // An invalid code is flagged and changes nothing.
  await code.fill("nope");
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await code.press("Enter");
  expect(await sessionColor(page)).toBe("#00ff88");

  // Favourites are still there after a relaunch.
  await page.reload();
  await page.getByRole("button", { name: "More colours" }).click();
  await page.getByRole("button", { name: "Use #00ff88" }).click();
  await expect.poll(() => sessionColor(page)).toBe("#00ff88");
});

test("the colour wheel and brightness slider change the colour", async ({
  page,
}) => {
  await page.getByRole("button", { name: "More colours" }).click();
  const wheel = page.getByTestId("color-wheel");
  const box = await wheel.boundingBox();
  if (!box) throw new Error("The colour wheel is not on screen");

  // Full saturation at three o'clock is pure red at full brightness.
  await page.getByRole("slider", { name: "Brightness" }).fill("100");
  await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
  await expect.poll(() => sessionColor(page)).toMatch(/^#ff0[0-4]0[0-4]$/);

  await page.getByRole("slider", { name: "Brightness" }).fill("0");
  await expect.poll(() => sessionColor(page)).toBe("#000000");

  // Drawing puts the picker away.
  await drag(page, { x: 200, y: 200 }, { x: 300, y: 220 });
  await expect(
    page.getByRole("dialog", { name: "Colour picker" }),
  ).toBeHidden();
});

test("a tap shows a ring and leaves no ink, a drag does not show one", async ({
  page,
}) => {
  await page.mouse.click(400, 300);
  await expect(page.getByTestId("tap-ripple")).toBeVisible();
  await expect(page.getByTestId("tap-ripple")).toHaveCount(0);
  await expectNoInk(page);

  await drag(page, { x: 200, y: 200 }, { x: 400, y: 260 });
  await expect(page.getByTestId("tap-ripple")).toHaveCount(0);
});

test("the spotlight puts the drawing tools away until one is picked", async ({
  page,
}) => {
  const pen = page.getByRole("button", { name: "Pen", exact: true });
  await expect(pen).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("s");
  await expect(pen).toHaveAttribute("aria-pressed", "false");
  await drag(page, { x: 200, y: 200 }, { x: 420, y: 300 });
  await expectNoInk(page);

  await page.keyboard.press("p");
  await expect.poll(() => spotlightOn(page)).toBe(false);
  await expect(pen).toHaveAttribute("aria-pressed", "true");
  await drag(page, { x: 200, y: 200 }, { x: 420, y: 300 });
  await expectInk(page);
});

test("the toolbar stays where it was dragged after leaving draw mode", async ({
  page,
}) => {
  const toolbar = page.getByRole("toolbar");
  const grip = toolbar.locator(".tb-grip");
  const start = await grip.boundingBox();
  if (!start) throw new Error("The toolbar grip is not on screen");
  await page.mouse.move(start.x + 5, start.y + 5);
  await page.mouse.down();
  await page.mouse.move(start.x - 95, start.y - 195, { steps: 5 });
  await page.mouse.up();
  const moved = await toolbar.boundingBox();

  await page.keyboard.press("Escape");
  await expect(toolbar).toBeHidden();
  await page.evaluate(() =>
    window.__ratelpenFake?.setSession({ active: true }),
  );
  await expect(toolbar).toBeVisible();
  expect(await toolbar.boundingBox()).toEqual(moved);

  // And after a relaunch.
  await page.reload();
  await expect(toolbar).toBeVisible();
  expect(await toolbar.boundingBox()).toEqual(moved);
});

const sessionTool = (page: Page) =>
  page.evaluate(() => window.__ratelpenFake?.snapshot().session.tool);

test("each tool remembers the colour it was last used with", async ({
  page,
}) => {
  const first = await sessionColor(page);
  // Pen keeps the first colour; text gets palette colour 5.
  await page.keyboard.press("t");
  await page.keyboard.press("5");
  const textColor = await sessionColor(page);
  expect(textColor).not.toBe(first);

  await page.keyboard.press("p");
  await expect.poll(() => sessionColor(page)).toBe(first);
  await page.keyboard.press("t");
  await expect.poll(() => sessionColor(page)).toBe(textColor);

  // Still true after a relaunch, where the session starts on the pen again.
  await page.reload();
  await expect(page.getByRole("toolbar")).toBeVisible();
  await page.keyboard.press("t");
  await expect.poll(() => sessionColor(page)).toBe(textColor);
});

test("the global shortcut still leaves draw mode when keys come straight to the overlay", async ({
  page,
}) => {
  await drag(page, { x: 200, y: 200 }, { x: 400, y: 260 });
  await page.keyboard.press("Alt+Shift+KeyC");
  await expectNoInk(page);

  await page.keyboard.press("Alt+Tab");
  await expect(page.getByRole("toolbar")).toBeHidden();
  expect(await sessionTool(page)).toBe("pen");
});

test("says so when the keyboard lock needs a permission", async ({ page }) => {
  await page.evaluate(() =>
    window.__ratelpenFake?.emitOverlayCommand({ type: "lock-permission" }),
  );
  await expect(page.getByRole("alert")).toContainText("Accessibility");
});
