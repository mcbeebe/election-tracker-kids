import { describe, expect, it } from "vitest";
import { cand } from "@/test/factories";
import { catchUp, LIKELY_REQUIRED_SHARE } from "./catch-up";

const race = (a: number, b: number, percentReporting: number, state = "OH") => ({
  candidates: [cand("a", { votes: a }), cand("b", { votes: b })],
  percentReporting,
  state,
});

describe("catchUp", () => {
  it("too_early with no votes", () => {
    expect(catchUp(race(0, 0, 10))).toMatchObject({ verdict: "too_early", estimatedOutstanding: null });
  });

  it("too_early at 0% reporting even if votes exist (early/absentee batches)", () => {
    expect(catchUp(race(100, 50, 0)).verdict).toBe("too_early");
  });

  it("too_early with no candidates", () => {
    expect(catchUp({ candidates: [], percentReporting: 50, state: "OH" }).verdict).toBe("too_early");
  });

  it("estimates outstanding as total/p − total", () => {
    // 1,000 counted at 50% → ~1,000 outstanding.
    expect(catchUp(race(600, 400, 50)).estimatedOutstanding).toBe(1000);
  });

  it("locked when margin exceeds outstanding", () => {
    // 900 counted at 90% → 100 outstanding; margin 300.
    expect(catchUp(race(600, 300, 90))).toMatchObject({ verdict: "locked", marginVotes: 300, requiredShare: null });
  });

  it("not locked when margin equals outstanding (trailer could still tie)", () => {
    // 1,000 at 50% → 1,000 outstanding; margin 1,000 → needs 100%.
    const r = catchUp(race(1000, 0, 50));
    expect(r.verdict).toBe("likely");
    expect(r.requiredShare).toBe(1);
  });

  it("likely when the trailer needs ≥60% of what is left", () => {
    // 1,000 outstanding, margin 200 → needs exactly 60%.
    const r = catchUp(race(600, 400, 50));
    expect(r.requiredShare).toBeCloseTo(LIKELY_REQUIRED_SHARE);
    expect(r.verdict).toBe("likely");
  });

  it("open when the trailer needs less than 60%", () => {
    const r = catchUp(race(550, 450, 50));
    expect(r.requiredShare).toBeCloseTo(0.55);
    expect(r.verdict).toBe("open");
  });

  it("at 100% reporting, any lead is locked and an exact tie is open", () => {
    expect(catchUp(race(501, 500, 100)).verdict).toBe("locked");
    expect(catchUp(race(500, 500, 100))).toMatchObject({ verdict: "open", estimatedOutstanding: 0 });
  });

  it("handles an unopposed candidate (runner-up = 0 votes)", () => {
    const r = catchUp({ candidates: [cand("a", { votes: 900 })], percentReporting: 90, state: "OH" });
    expect(r).toMatchObject({ verdict: "locked", marginVotes: 900 });
  });

  it("flags low reporting as unreliable without changing the verdict", () => {
    const r = catchUp(race(30, 10, 4));
    expect(r).toMatchObject({ unreliable: true, reasons: ["low_reporting"] });
    expect(r.verdict).toBe("open");
  });

  it.each(["CA", "AZ", "NV", "WA", "OR", "UT", "CO"])("flags mail-heavy %s", (state) => {
    expect(catchUp(race(600, 300, 90, state))).toMatchObject({
      verdict: "locked",
      unreliable: true,
      reasons: ["mail_heavy_state"],
    });
  });

  it("reports both reasons when both apply", () => {
    expect(catchUp(race(1, 0, 1, "CA")).reasons).toEqual(["low_reporting", "mail_heavy_state"]);
  });

  it("is reliable for a non-mail state above 5%", () => {
    expect(catchUp(race(600, 300, 90)).unreliable).toBe(false);
  });
});
