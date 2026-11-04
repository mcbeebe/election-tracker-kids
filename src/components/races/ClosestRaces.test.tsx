// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { closestRaces } from "@/lib/view/tiles";
import { cand } from "@/test/factories";
import { race } from "@/test/fake-provider";
import { ClosestRaces } from "./ClosestRaces";

describe("ClosestRaces", () => {
  it("shows margin, % reporting and arithmetic verdict for each race", () => {
    const rows = closestRaces([
      race("1", { name: "Ohio US Senate", state: "OH", percentReporting: 40, totalVotes: 100,
        candidates: [cand("a", { name: "Ann Alpha", votes: 51 }), cand("b", { name: "Bob Beta", votes: 49, party: "Republican" })] }),
    ]);
    render(<ClosestRaces rows={rows} />);
    expect(screen.getByText("Ohio US Senate")).toBeInTheDocument();
    expect(screen.getByText("40% in")).toBeInTheDocument();
    expect(screen.getByText(/D \+2\.0 · Open/)).toBeInTheDocument();
    expect(screen.getByText("51.0%")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("marks unreliable estimates with an asterisk and handles a missing runner-up", () => {
    const rows = closestRaces([race("1", { state: "CA", percentReporting: 2, totalVotes: 5, candidates: [cand("a", { votes: 5 })] })]);
    render(<ClosestRaces rows={rows} />);
    expect(screen.getByText(/Open\*|Locked\*|Likely\*/)).toBeInTheDocument();
  });

  it("has an empty state", () => {
    render(<ClosestRaces rows={[]} />);
    expect(screen.getByText(/No uncalled races/)).toBeInTheDocument();
  });
});
