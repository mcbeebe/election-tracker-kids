import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("log", () => {
  it.each([
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ] as const)("routes %s to console.%s as one JSON line", (level, method) => {
    const spy = vi.spyOn(console, method).mockImplementation(() => undefined);
    log(level, "test.event", { n: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0]![0]));
    expect(line).toMatchObject({ level, event: "test.event", n: 1 });
    expect(Date.parse(line.at)).not.toBeNaN();
  });

  it("defaults data to an empty object", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    log("info", "bare");
    expect(Object.keys(JSON.parse(String(spy.mock.calls[0]![0])))).toEqual(["level", "event", "at"]);
  });
});
