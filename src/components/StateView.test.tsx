// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Chamber } from "@/lib/providers/types";
import type { ResultsPayload } from "@/lib/results/service";
import { GOVERNOR_PRE, HOUSE_LIVE, SENATE_LIVE, splitFixture } from "@/test/live-fixtures";
import { normalizedFixture } from "@/test/live-fixtures";
import { StateView } from "./StateView";

const SOURCES: Record<Chamber, () => ReturnType<typeof splitFixture>["seats"]> = {
  senate: () => splitFixture(SENATE_LIVE).seats,
  house: () => splitFixture(HOUSE_LIVE).seats,
  governor: () => splitFixture(GOVERNOR_PRE).seats,
  measures: () => normalizedFixture("civicapi_search_referendum_offset0_2026-11-04T0100Z.json"),
};

function mockFetch(failing: Chamber[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const p = new URL(url, "http://x").searchParams;
      const chamber = p.get("chamber") as Chamber;
      if (failing.includes(chamber)) return Response.json({ message: "HTTP 502" }, { status: 503 });
      const body: ResultsPayload = {
        chamber, source: "civicapi", asOf: new Date().toISOString(), servedAt: new Date().toISOString(), stale: false,
        cache: "hit", lastError: null, races: SOURCES[chamber]().filter((r) => r.state === p.get("state")), aggregate: null,
      };
      return Response.json(body);
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("StateView", () => {
  it("California: 52 House races, governor, measures, and no Senate race", async () => {
    mockFetch();
    render(<StateView code="CA" />);
    expect(await screen.findByRole("heading", { name: "House · 52 races" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "California", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Governor · 1 race" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Ballot measures · \d+ measures/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Senate" })).toBeInTheDocument();
    expect(screen.getByText("No Senate race in California this year.")).toBeInTheDocument();
    // Every loaded panel carries its own source + "as of" (header badge + 4 panels).
    expect(screen.getAllByText(/civicAPI · as of/)).toHaveLength(5);
  });

  it("reports a failing chamber and keeps the rest", async () => {
    mockFetch(["house"]);
    render(<StateView code="GA" />);
    expect(await screen.findByRole("heading", { name: "Senate · 1 race" })).toBeInTheDocument();
    expect(screen.getByText("Unavailable right now.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("House");
  });
});
