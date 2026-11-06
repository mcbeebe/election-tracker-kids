// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResultsPayload } from "@/lib/results/service";
import { normalizedFixture } from "@/test/live-fixtures";
import { MeasuresView } from "./MeasuresView";

const ALL = normalizedFixture("civicapi_search_referendum_offset0_2026-11-04T0100Z.json");

function mockFetch() {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const p = new URL(url, "http://x").searchParams;
      const races = ALL.filter(
        (r) => (p.get("scope") !== "statewide" || r.electionType === "Statewide") && (!p.get("state") || r.state === p.get("state")),
      );
      const body: ResultsPayload = {
        chamber: "measures", source: "civicapi", asOf: new Date().toISOString(), servedAt: new Date().toISOString(),
        stale: false, cache: "hit", lastError: null, races, aggregate: null,
      };
      return Response.json(body);
    }),
  );
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe("MeasuresView", () => {
  it("defaults to statewide measures and can include local ones", async () => {
    const urls = mockFetch();
    render(<MeasuresView />);
    expect(await screen.findByRole("table", { name: "Ballot measures" })).toBeInTheDocument();
    expect(urls[0]).toContain("scope=statewide");
    fireEvent.click(screen.getByRole("checkbox", { name: "Include local measures" }));
    await waitFor(() => expect(urls.at(-1)).toContain("scope=all"));
  });

  it("filters by state on the server and by keyword on the client", async () => {
    const urls = mockFetch();
    render(<MeasuresView />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("combobox", { name: "State" }), { target: { value: "CA" } });
    await waitFor(() => expect(urls.at(-1)).toContain("state=CA"));
    await waitFor(() => expect(screen.getAllByRole("rowheader").every((th) => th.textContent?.startsWith("California"))).toBe(true));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "zzz-no-match" } });
    expect(screen.getByText("No measures match.")).toBeInTheDocument();
    expect(screen.getByText("0 measures")).toBeInTheDocument();
  });

  it("never shows the previous filter's rows while the new filter is loading or after it fails", async () => {
    let releaseCa: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const p = new URL(url, "http://x").searchParams;
        if (p.get("state") === "CA") return new Promise<Response>((res) => (releaseCa = res));
        const races = ALL.filter((r) => r.electionType === "Statewide");
        const body: ResultsPayload = {
          chamber: "measures", source: "civicapi", asOf: new Date().toISOString(), servedAt: new Date().toISOString(),
          stale: false, cache: "hit", lastError: null, races, aggregate: null,
        };
        return Response.json(body);
      }),
    );
    render(<MeasuresView />);
    await screen.findByRole("table");
    expect(screen.getAllByRole("rowheader").some((th) => !th.textContent?.startsWith("California"))).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "State" }), { target: { value: "CA" } });
    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    releaseCa(Response.json({ message: "HTTP 502" }, { status: 503 }));
    expect(await screen.findByText("Results are unavailable right now.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows an unavailable message when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "HTTP 502" }, { status: 503 })));
    render(<MeasuresView />);
    expect(await screen.findByText("Results are unavailable right now.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("ballot measures");
  });
});
