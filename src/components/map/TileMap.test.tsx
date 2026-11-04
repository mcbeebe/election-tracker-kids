// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildStateTiles } from "@/lib/view/tiles";
import { SENATE_LIVE, splitFixture } from "@/test/live-fixtures";
import { TileMap } from "./TileMap";

describe("TileMap", () => {
  it("renders 50 labeled tiles with called states solid", () => {
    render(<TileMap tiles={buildStateTiles(splitFixture(SENATE_LIVE).seats, false)} label="Senate races by state" />);
    const list = screen.getByRole("list", { name: "Senate races by state" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(50);
    const ga = items.find((li) => li.getAttribute("data-state") === "called" && li.textContent?.startsWith("GA"))!;
    expect(ga).toHaveStyle({ backgroundColor: "rgb(58, 111, 183)" });
    const link = within(ga).getByRole("link");
    expect(link).toHaveAccessibleName(/Georgia US Senate: called for .* by civicAPI/);
    expect(link).toHaveAttribute("href", "/state/GA");
  });
});
