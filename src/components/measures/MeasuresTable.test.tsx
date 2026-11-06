// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { measureRow } from "@/lib/view/measures";
import { cand } from "@/test/factories";
import { race } from "@/test/fake-provider";
import { MeasuresTable } from "./MeasuresTable";

const m = (id: string, candidates: ReturnType<typeof cand>[], extra = {}) =>
  measureRow(race(id, { chamber: "measures", candidates, totalVotes: candidates.reduce((s, c) => s + c.votes, 0), ...extra }));

describe("MeasuresTable", () => {
  it("shows Yes/No shares, locality, reporting and an honest status", () => {
    render(
      <MeasuresTable
        caption="Ballot measures"
        rows={[m("1", [cand("y", { name: "Yes", votes: 6 }), cand("n", { name: "No", votes: 4 })], { name: "Measure A", state: "CA", locality: "Alameda", percentReporting: 12 })]}
      />,
    );
    expect(screen.getByRole("rowheader", { name: /^Measure A/ })).toBeInTheDocument();
    expect(screen.getAllByText("CA · Alameda")).toHaveLength(2);
    expect(screen.getByText("Yes 60.0%")).toBeInTheDocument();
    expect(screen.getByText("12% in")).toBeInTheDocument();
    expect(screen.getAllByText("Yes leads")).toHaveLength(2);
    expect(screen.getByTestId("mobile-meta")).toHaveTextContent("12% in · Yes leads");
    expect(screen.queryByText(/passing/i)).toBeNull();
  });

  it("lists options for multi-choice questions and has an empty state", () => {
    const { rerender } = render(
      <MeasuresTable caption="x" rows={[m("2", [cand("a", { name: "Rifle", votes: 3 }), cand("b", { name: "Pistol", votes: 1 })])]} />,
    );
    expect(screen.getByText("Rifle")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
    rerender(<MeasuresTable caption="x" rows={[]} />);
    expect(screen.getByText("No measures match.")).toBeInTheDocument();
  });
});
