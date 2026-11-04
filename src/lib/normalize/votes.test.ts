import { describe, expect, it } from "vitest";
import { cand } from "@/test/factories";
import { topTwo } from "./votes";

describe("topTwo", () => {
  it("returns nulls and 0 for no candidates", () => {
    expect(topTwo([])).toEqual({ first: null, second: null, total: 0 });
  });

  it("finds the top two by votes regardless of order and sums all votes", () => {
    const r = topTwo([cand("a", { votes: 5 }), cand("b", { votes: 50 }), cand("c", { votes: 20 })]);
    expect([r.first?.id, r.second?.id, r.total]).toEqual(["b", "c", 75]);
  });

  it("keeps source order on ties and does not mutate input", () => {
    const cs = [cand("a", { votes: 1 }), cand("b", { votes: 1 })];
    expect(topTwo(cs).first?.id).toBe("a");
    expect(cs.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("handles a single candidate", () => {
    expect(topTwo([cand("a", { votes: 3 })])).toMatchObject({ second: null, total: 3 });
  });
});
