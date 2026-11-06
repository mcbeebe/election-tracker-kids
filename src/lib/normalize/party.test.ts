import { describe, expect, it } from "vitest";
import { COUNTING_COLOR, PARTY_COLORS, partyColor, partyKey } from "./party";

describe("partyKey", () => {
  it.each([
    ["Democratic", "D"],
    ["democrat", "D"],
    ["Democratic-Farmer-Labor", "D"],
    [" Republican ", "R"],
    ["GOP", "R"],
    ["Independent", "I"],
    ["Libertarian", "O"],
    ["Green", "O"],
    ["Nonpartisan", "O"],
    ["DEM/NON", "O"],
    ["The Independent Party", "O"],
    ["", "O"],
  ] as const)("%j → %s", (raw, key) => {
    expect(partyKey(raw)).toBe(key);
  });
});

describe("partyColor", () => {
  it("uses the CLAUDE.md palette, not source colors", () => {
    expect(partyColor("Democratic")).toBe("#3A6FB7");
    expect(partyColor("Republican")).toBe("#C0463F");
    expect(partyColor("Independent")).toBe("#6B7A94");
    expect(partyColor("Libertarian")).toBe("#6B7A94");
  });

  it("keeps counting distinct from every party color", () => {
    expect(Object.values(PARTY_COLORS)).not.toContain(COUNTING_COLOR);
  });
});
