import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, parseColorInput, rgbLabel } from "./color";

describe("colour conversion", () => {
  it("converts the primaries and greys", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000ff");
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 200, s: 0, v: 0.5 })).toBe("#808080");
    expect(hsvToHex({ h: 90, s: 1, v: 0 })).toBe("#000000");
  });

  it("round-trips palette colours through HSV", () => {
    ["#ff3b30", "#ffd60a", "#34c759", "#0a84ff", "#bf5af2", "#1c1c1e"].forEach(
      (hex) => expect(hsvToHex(hexToHsv(hex))).toBe(hex),
    );
  });

  it("reads hex and RGB the way people type them", () => {
    expect(parseColorInput("#FF3B30")).toBe("#ff3b30");
    expect(parseColorInput(" ff3b30 ")).toBe("#ff3b30");
    expect(parseColorInput("#f80")).toBe("#ff8800");
    expect(parseColorInput("rgb(255, 59, 48)")).toBe("#ff3b30");
    expect(parseColorInput("255,59,48")).toBe("#ff3b30");
    expect(parseColorInput("255 59 48")).toBe("#ff3b30");
    expect(rgbLabel("#ff3b30")).toBe("255, 59, 48");
  });

  it.each(["", "#ff3b3", "red", "256,0,0", "1,2", "rgb(1,2,3,4)", "#gggggg"])(
    "rejects %j",
    (input) => expect(parseColorInput(input)).toBeNull(),
  );
});
