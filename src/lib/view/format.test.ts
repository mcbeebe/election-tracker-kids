import { describe, expect, it } from "vitest";
import { formatMargin, formatPt, formatReporting, formatVotes } from "./format";

describe("format", () => {
  it("formatPt renders Pacific time and handles bad input", () => {
    expect(formatPt("2026-11-04T03:42:00.000Z")).toBe("7:42 PM PT");
    expect(formatPt(null)).toBe("—");
    expect(formatPt("nope")).toBe("—");
  });

  it("formatMargin", () => {
    expect(formatMargin("D", 2.44)).toBe("D +2.4");
    expect(formatMargin("R", 10)).toBe("R +10.0");
    expect(formatMargin("O", 1)).toBe("Other +1.0");
    expect(formatMargin("I", 3)).toBe("I +3.0");
    expect(formatMargin("D", 0)).toBe("Even");
  });

  it("formatReporting keeps tiny early counts visible", () => {
    expect(formatReporting(0)).toBe("0% in");
    expect(formatReporting(0.24)).toBe("0.2% in");
    expect(formatReporting(31.6)).toBe("32% in");
    expect(formatReporting(100)).toBe("100% in");
  });

  it("formatVotes", () => {
    expect(formatVotes(1234567)).toBe("1,234,567");
  });
});
