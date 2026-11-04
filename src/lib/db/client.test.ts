import { describe, expect, it } from "vitest";
import { getServerDb } from "./client";

describe("getServerDb", () => {
  it("returns null when Supabase env is missing (snapshots disabled)", () => {
    expect(getServerDb({})).toBeNull();
    expect(getServerDb({ SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(getServerDb({ SUPABASE_SERVICE_ROLE_KEY: "k" })).toBeNull();
  });

  it("creates a client when configured", () => {
    const db = getServerDb({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" });
    expect(typeof db?.from).toBe("function");
  });
});
