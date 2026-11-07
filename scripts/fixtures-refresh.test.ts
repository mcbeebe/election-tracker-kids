import { describe, expect, it } from "vitest";
import { fixtureName, isLastPage, MIN_SPACING_MS, PAGE_LIMIT, RETRY_WAITS_MS, searchUrl, TARGETS } from "./fixtures-refresh.mjs";

describe("fixtures-refresh helpers", () => {
  it("names files like the existing dated fixtures", () => {
    const at = new Date("2026-11-04T00:49:31.000Z");
    expect(fixtureName("house", at)).toBe("civicapi_search_house_2026-11-04T0049Z.json");
    expect(fixtureName("referendum", at, 500)).toBe("civicapi_search_referendum_offset500_2026-11-04T0049Z.json");
  });

  it("builds search URLs with the exact verified type strings and paging", () => {
    const u = new URL(searchUrl("House of Representatives", 500));
    expect(u.pathname).toBe("/api/v2/race/search");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      startDate: "2026-11-03",
      endDate: "2026-11-03",
      type: "House of Representatives",
      limit: "500",
      offset: "500",
    });
    expect(TARGETS.map((t) => t.type)).toEqual(["US Senate", "House of Representatives", "Governor", "Proposition", "Referendum"]);
  });

  it("stops paging on a short or malformed page", () => {
    expect(isLastPage({ races: new Array(PAGE_LIMIT).fill({}) })).toBe(false);
    expect(isLastPage({ races: [{}] })).toBe(true);
    expect(isLastPage({})).toBe(true);
  });

  it("is gentler than the app itself: ≥3 s between requests, 30 s+ retry waits", () => {
    expect(MIN_SPACING_MS).toBeGreaterThanOrEqual(3_000);
    expect(Math.min(...RETRY_WAITS_MS)).toBeGreaterThanOrEqual(30_000);
  });
});
