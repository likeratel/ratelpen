import { describe, expect, it } from "vitest";
import {
  createIdGenerator,
  extendDraft,
  finishDraft,
  startDraft,
} from "./draft";

const style = { color: "#0a84ff", width: 4, fade: true };
const p = (x: number, y: number, pressure = 0.5) => ({ x, y, pressure });

describe("drafts", () => {
  it("collects freehand points and skips duplicates", () => {
    const draft = extendDraft(
      startDraft("pen", p(0, 0), style),
      [p(0, 0), p(5, 5), p(5, 5.1)],
      false,
    );
    const shape = finishDraft(draft, "s1", 42);
    expect(shape).toMatchObject({
      kind: "freehand",
      brush: "pen",
      fade: true,
      createdAt: 42,
    });
    expect(shape?.kind === "freehand" && shape.points).toHaveLength(2);
  });

  it("keeps a single click with the pen as a dot", () => {
    expect(
      finishDraft(startDraft("pen", p(1, 1), style), "s", 0),
    ).not.toBeNull();
  });

  it("drops lines and boxes that are too small", () => {
    expect(finishDraft(startDraft("line", p(1, 1), style), "s", 0)).toBeNull();
    const thin = extendDraft(
      startDraft("rect", p(0, 0), style),
      [p(100, 1)],
      false,
    );
    expect(finishDraft(thin, "s", 0)).toBeNull();
  });

  it("applies the Shift constraint to rectangles", () => {
    const draft = extendDraft(
      startDraft("rect", p(0, 0), style),
      [p(50, 20)],
      true,
    );
    expect(finishDraft(draft, "s", 0)).toMatchObject({
      kind: "rect",
      to: { x: 50, y: 50 },
    });
  });

  it("applies the Shift constraint to arrows", () => {
    const draft = extendDraft(
      startDraft("arrow", p(0, 0), style),
      [p(100, 3)],
      true,
    );
    const shape = finishDraft(draft, "s", 0);
    expect(shape?.kind === "arrow" && shape.to.y).toBeCloseTo(0);
  });

  it("generates unique ids", () => {
    const next = createIdGenerator("x");
    expect([next(), next()]).toEqual(["x-1", "x-2"]);
  });
});
