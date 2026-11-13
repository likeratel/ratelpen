import { describe, expect, it } from "vitest";
import { rememberColor, sanitizeToolColors, switchTool } from "./toolColors";

describe("colours per tool", () => {
  it("gives a tool back the colour it last had", () => {
    const afterPen = switchTool({}, "pen", "text", "#ff0000");
    // Text had no colour yet, so it starts with the one in use.
    expect(afterPen).toEqual({ colors: { pen: "#ff0000" }, color: "#ff0000" });

    const withBlackText = rememberColor(afterPen.colors, "text", "#000000");
    const backToPen = switchTool(withBlackText, "text", "pen", "#000000");
    expect(backToPen.color).toBe("#ff0000");
    expect(switchTool(backToPen.colors, "pen", "text", "#ff0000").color).toBe(
      "#000000",
    );
  });

  it("never gives the eraser a colour", () => {
    expect(rememberColor({}, "eraser", "#123456")).toEqual({});
    const viaEraser = switchTool(
      { pen: "#ff0000" },
      "eraser",
      "pen",
      "#00ff00",
    );
    expect(viaEraser).toEqual({ colors: { pen: "#ff0000" }, color: "#ff0000" });
  });

  it("does not trust stored data", () => {
    expect(sanitizeToolColors(null)).toEqual({});
    expect(
      sanitizeToolColors({ pen: "#FF0000", text: "nope", spray: "#000000" }),
    ).toEqual({ pen: "#ff0000" });
  });
});
