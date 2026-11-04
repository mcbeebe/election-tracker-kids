// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultsPayload } from "@/lib/results/service";
import { GOVERNOR_PRE, HOUSE_LIVE, SENATE_LIVE, splitFixture } from "@/test/live-fixtures";
import { NationalView } from "./NationalView";

const FILES = { senate: SENATE_LIVE, house: HOUSE_LIVE, governor: GOVERNOR_PRE } as const;

function payload(chamber: keyof typeof FILES, asOf: string): ResultsPayload {
  const { seats, aggregate } = splitFixture(FILES[chamber]);
  return { chamber, source: "civicapi", asOf, servedAt: asOf, stale: false, cache: "miss", lastError: null, races: seats, aggregate };
}

function mockFetch(handler: (chamber: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => handler(new URL(url, "http://x").searchParams.get("chamber")!)),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-04T01:00:30.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NationalView", () => {
  it("renders BoP bars, Senate map and closest races from /api/results", async () => {
    mockFetch((c) => Response.json(payload(c as keyof typeof FILES, "2026-11-04T01:00:00.000Z")));
    render(<NationalView />);
    expect(await screen.findByRole("img", { name: /Senate: Democrats 36, Republicans 31/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Senate · 35 seats up/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Senate races by state" })).toBeInTheDocument();
    expect(screen.getAllByText(/civicAPI · as of 5:00 PM PT/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("leading is off by default and appears when toggled", async () => {
    mockFetch((c) => Response.json(payload(c as keyof typeof FILES, "2026-11-04T01:00:00.000Z")));
    const { container } = render(<NationalView />);
    await screen.findByRole("list", { name: "Senate races by state" });
    expect(container.querySelectorAll('[data-state="leading"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show leading" }));
    expect(container.querySelectorAll('[data-state="leading"]').length).toBeGreaterThan(0);
  });

  it("switches chamber tabs (House hides the leading toggle)", async () => {
    mockFetch((c) => Response.json(payload(c as keyof typeof FILES, "2026-11-04T01:00:00.000Z")));
    render(<NationalView />);
    await screen.findByRole("list", { name: "Senate races by state" });
    fireEvent.click(within(screen.getByRole("tablist")).getByRole("tab", { name: "House" }));
    expect(screen.getByRole("heading", { name: /House · 435 seats up/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Show leading" })).toBeNull();
  });

  it("shows a stale banner when data is older than 3 minutes", async () => {
    mockFetch((c) => Response.json(payload(c as keyof typeof FILES, "2026-11-04T00:50:00.000Z")));
    render(<NationalView />);
    expect(await screen.findByRole("status")).toHaveTextContent(/Data may be out of date — last update 4:50 PM PT/);
  });

  it("shows an unavailable message and error banner when civicAPI is down", async () => {
    mockFetch(() => Response.json({ error: "upstream_unavailable", message: "HTTP 502" }, { status: 503 }));
    render(<NationalView />);
    expect(await screen.findByText(/Results are unavailable right now/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/not responding for Senate, House, Governors/);
  });

  it("keeps last good data when a later poll fails, and counts down to the next poll", async () => {
    let fail = false;
    mockFetch((c) =>
      fail ? Response.json({}, { status: 503 }) : Response.json(payload(c as keyof typeof FILES, "2026-11-04T01:00:00.000Z")),
    );
    render(<NationalView />);
    await screen.findByRole("img", { name: /Senate: Democrats 36/ });
    expect(screen.getByText(/next update in 4[45]s/)).toBeInTheDocument();
    fail = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(screen.getByRole("img", { name: /Senate: Democrats 36/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/HTTP 503|not responding/);
  });

  it("shows the dev banner when serving fixtures", async () => {
    mockFetch((c) => Response.json({ ...payload(c as keyof typeof FILES, "2026-11-04T01:00:00.000Z"), source: "fixtures" }));
    render(<NationalView />);
    expect(await screen.findByRole("note")).toHaveTextContent(/Not live results/);
  });
});
