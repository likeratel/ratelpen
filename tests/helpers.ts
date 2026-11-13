import { expect, type Page } from "@playwright/test";

export async function openOverlay(page: Page): Promise<void> {
  await page.goto("/?view=overlay");
  await expect(page.getByRole("toolbar")).toBeVisible();
}

/** Number of non-transparent pixels on the committed ink canvas. */
export async function inkPixels(page: Page): Promise<number> {
  return page.getByTestId("ink-canvas").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
    return count;
  });
}

/** Alpha of one pixel on the ink canvas, in CSS px coordinates. */
export async function inkAlphaAt(
  page: Page,
  x: number,
  y: number,
): Promise<number> {
  return page.getByTestId("ink-canvas").evaluate(
    (node, point) => {
      const canvas = node as HTMLCanvasElement;
      const ratio = canvas.width / canvas.clientWidth;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D context");
      return ctx.getImageData(
        Math.round(point.x * ratio),
        Math.round(point.y * ratio),
        1,
        1,
      ).data[3];
    },
    { x, y },
  );
}

export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export async function expectInk(page: Page): Promise<void> {
  await expect.poll(() => inkPixels(page)).toBeGreaterThan(0);
}

export async function expectNoInk(page: Page): Promise<void> {
  await expect.poll(() => inkPixels(page)).toBe(0);
}

/** What this overlay last reported to the (fake) core through report_content. */
export async function reportedContent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const fake = window.__ratelpenFake;
    if (!fake) throw new Error("Fake bridge is not active");
    return fake.snapshot().hasContent;
  });
}

/** Sends an overlay-command event as the tray or a global shortcut would. */
export async function sendClearCommand(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.__ratelpenFake?.emitOverlayCommand({ type: "clear" }),
  );
}
