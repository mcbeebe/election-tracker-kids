// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { raceRows } from "@/lib/view/races";
import { HOUSE_LIVE, splitFixture } from "@/test/live-fixtures";
import { RaceTable } from "./RaceTable";

describe("RaceTable", () => {
  it("renders 52 CA House rows with seat, % reporting and status", () => {
    const rows = raceRows(splitFixture(HOUSE_LIVE).seats.filter((r) => r.state === "CA"));
    render(<RaceTable caption="California House races" rows={rows} showSeat />);
    const table = screen.getByRole("table", { name: "California House races" });
    expect(within(table).getAllByRole("row")).toHaveLength(53);
    expect(within(table).getByRole("rowheader", { name: "CA-01" })).toBeInTheDocument();
    expect(within(table).getAllByText(/^\d+% in$/)).toHaveLength(52);
    expect(within(table).getAllByTestId("mobile-meta")).toHaveLength(52);
  });

  it("marks winners and shows race names when the seat column is off", () => {
    const rows = raceRows(splitFixture(HOUSE_LIVE).seats.filter((r) => r.candidates.some((c) => c.winner)).slice(0, 1));
    render(<RaceTable caption="t" rows={rows} />);
    expect(screen.getByText(/✓/)).toBeInTheDocument();
    expect(screen.getAllByText("Called · civicAPI")).toHaveLength(2);
    expect(screen.queryByRole("rowheader")).toBeNull();
  });
});
