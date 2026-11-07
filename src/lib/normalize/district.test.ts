import { describe, expect, it } from "vitest";
import { parseDistrict, US_STATE_CODES } from "./district";

describe("parseDistrict", () => {
  it.each([
    ["CA-01", { state: "CA", district: 1, atLarge: false }],
    ["GA-11", { state: "GA", district: 11, atLarge: false }],
    ["ca-7", { state: "CA", district: 7, atLarge: false }],
    ["AK-AL", { state: "AK", district: null, atLarge: true }],
    ["WY-00", { state: "WY", district: null, atLarge: true }],
    ["AZ", { state: "AZ", district: null, atLarge: false }],
    [" TX-38 ", { state: "TX", district: 38, atLarge: false }],
    // Alabama's USPS code is "AL": must not be confused with the at-large suffix.
    ["AL-04", { state: "AL", district: 4, atLarge: false }],
    ["DE-AL", { state: "DE", district: null, atLarge: true }],
  ] as const)("%j", (code, expected) => {
    expect(parseDistrict(code)).toEqual(expected);
  });

  it.each(["", "CA01", "CA-", "CA-123", "XX-01", "California-01", "CA-AB"])(
    "rejects %j",
    (code) => {
      expect(parseDistrict(code)).toBeNull();
    },
  );

  it("knows 50 states + DC + 5 territories", () => {
    expect(US_STATE_CODES.size).toBe(56);
  });
});
