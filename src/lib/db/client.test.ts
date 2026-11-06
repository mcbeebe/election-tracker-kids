import { describe, expect, it } from "vitest";
import { getServerDb, withTimeout } from "./client";

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

describe("withTimeout", () => {
  it("aborts after the timeout when no caller signal is given", async () => {
    const s = withTimeout(undefined, 5);
    await new Promise((r) => setTimeout(r, 20));
    expect(s.aborted).toBe(true);
  });

  it("follows the caller's signal as well as the timeout", () => {
    const caller = new AbortController();
    const s = withTimeout(caller.signal, 60_000);
    expect(s.aborted).toBe(false);
    caller.abort();
    expect(s.aborted).toBe(true);
  });
});
