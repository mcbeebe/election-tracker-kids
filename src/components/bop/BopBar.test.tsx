// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildBop } from "@/lib/view/bop";
import { GOVERNOR_PRE, SENATE_LIVE, splitFixture } from "@/test/live-fixtures";
import { BopBar } from "./BopBar";

describe("BopBar", () => {
  it("renders Senate totals, majority tick at 51%, and an accessible summary", () => {
    const { seats, aggregate } = splitFixture(SENATE_LIVE);
    render(<BopBar model={buildBop("senate", seats, aggregate)} />);
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(/Democrats 36, Republicans 31.*51 needed for a majority/);
    // Center line: a party past it holds a majority from either side (R at 50 seats must not cross it).
    expect(screen.getByTestId("majority-tick")).toHaveStyle({ left: "50%" });
    // 35 up − 2 called (GA, VA) = 33 uncalled, leading races included.
    expect(screen.getByTestId("bop-caption")).toHaveTextContent("33 uncalled · 51 to win (cross the center line)");
  });

  it("governors: no majority tick, races-up caption", () => {
    const { seats } = splitFixture(GOVERNOR_PRE);
    render(<BopBar model={buildBop("governor", seats, null)} />);
    expect(screen.queryByTestId("majority-tick")).toBeNull();
    expect(screen.getByTestId("bop-caption")).toHaveTextContent("36 races up");
  });

  it("says 'all called' when nothing is left", () => {
    const m = { ...buildBop("house", [], null), total: 2, d: 1, r: 1, racesUp: 2, called: { D: 1, R: 1, I: 0, O: 0 } };
    render(<BopBar model={m} />);
    expect(screen.getByTestId("bop-caption")).toHaveTextContent("all called");
  });

  it("shows an other/independent segment when there are such seats", () => {
    const m = { ...buildBop("senate", [], null), called: { D: 0, R: 0, I: 1, O: 0 } };
    render(<BopBar model={m} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/other 1/);
  });
});
