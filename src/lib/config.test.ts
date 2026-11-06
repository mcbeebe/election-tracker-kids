import { describe, expect, it } from "vitest";
import { ELECTION_DATE, loadServerConfig } from "./config";

describe("loadServerConfig", () => {
  it("applies defaults", () => {
    expect(loadServerConfig({})).toEqual({
      CIVICAPI_BASE: "https://civicapi.org/api/v2",
      CIVICAPI_MIN_INTERVAL_MS: 1000,
      CIVICAPI_TIMEOUT_MS: 60_000,
      RESULTS_TTL_SECONDS: 45,
      RESULTS_PROVIDER: "civicapi",
    });
  });

  it("treats empty strings as unset", () => {
    expect(loadServerConfig({ CIVICAPI_BASE: "", CIVICAPI_MIN_INTERVAL_MS: "" }).CIVICAPI_MIN_INTERVAL_MS).toBe(1000);
  });

  it("coerces numbers", () => {
    expect(loadServerConfig({ CIVICAPI_MIN_INTERVAL_MS: "2500" }).CIVICAPI_MIN_INTERVAL_MS).toBe(2500);
  });

  it("refuses an interval faster than 1 req/s", () => {
    expect(() => loadServerConfig({ CIVICAPI_MIN_INTERVAL_MS: "500" })).toThrow();
  });

  it("bounds the request timeout to 1 s – 120 s", () => {
    expect(loadServerConfig({ CIVICAPI_TIMEOUT_MS: "30000" }).CIVICAPI_TIMEOUT_MS).toBe(30_000);
    expect(() => loadServerConfig({ CIVICAPI_TIMEOUT_MS: "500" })).toThrow();
    expect(() => loadServerConfig({ CIVICAPI_TIMEOUT_MS: "300000" })).toThrow();
  });

  it("rejects a non-URL base", () => {
    expect(() => loadServerConfig({ CIVICAPI_BASE: "civicapi" })).toThrow();
  });

  it("accepts only known providers", () => {
    expect(loadServerConfig({ RESULTS_PROVIDER: "fixtures" }).RESULTS_PROVIDER).toBe("fixtures");
    expect(() => loadServerConfig({ RESULTS_PROVIDER: "scrape-nyt" })).toThrow();
  });

  it("reads process.env by default", () => {
    expect(loadServerConfig().CIVICAPI_BASE).toMatch(/^https?:\/\//);
  });

  it("targets Nov 3, 2026", () => {
    expect(ELECTION_DATE).toBe("2026-11-03");
  });
});
