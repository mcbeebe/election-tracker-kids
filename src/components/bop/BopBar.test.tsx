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
    expect(screen.getByTestId("majority-tick")).toHaveStyle({ left: "51%" });
    expect(screen.getByTestId("bop-caption")).toHaveTextContent(/uncalled · 51 to win/);
  });

  it("governors: no majority tick, races-up caption", () => {
    const { seats } = splitFixture(GOVERNOR_PRE);
    render(<BopBar model={buildBop("governor", seats, null)} />);
    expect(screen.queryByTestId("majority-tick")).toBeNull();
    expect(screen.getByTestId("bop-caption")).toHaveTextContent("36 races up");
  });

  it("says 'all called' when nothing is left", () => {
    const m = { ...buildBop("house", [], null), total: 2, d: 1, r: 1 };
    render(<BopBar model={m} />);
    expect(screen.getByTestId("bop-caption")).toHaveTextContent("all called");
  });

  it("shows an other/independent segment when there are such seats", () => {
    const m = { ...buildBop("senate", [], null), called: { D: 0, R: 0, I: 1, O: 0 } };
    render(<BopBar model={m} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/other 1/);
  });
});
