import { describe, expect, it } from "vitest";
import { US_STATE_CODES } from "@/lib/normalize/district";
import { STATE_NAMES, stateName } from "./states";

describe("stateName", () => {
  it("covers every known code", () => {
    expect(Object.keys(STATE_NAMES).sort()).toEqual([...US_STATE_CODES].sort());
  });
  it("is case-insensitive and falls back to the code", () => {
    expect(stateName("ca")).toBe("California");
    expect(stateName("zz")).toBe("ZZ");
  });
});
