// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceBadge } from "./SourceBadge";

describe("SourceBadge", () => {
  it("names the source and Pacific 'as of' time", () => {
    render(<SourceBadge source="civicapi" asOf="2026-11-04T03:42:00.000Z" />);
    expect(screen.getByText(/civicAPI · as of 7:42 PM PT/)).toBeInTheDocument();
  });

  it("flags stale data and labels dev fixtures and unknown sources", () => {
    const { rerender } = render(<SourceBadge source="fixtures" asOf={null} stale />);
    expect(screen.getByText(/Recorded civicAPI data \(dev\) · as of — \(stale\)/)).toBeInTheDocument();
    rerender(<SourceBadge source="other" asOf={null} />);
    expect(screen.getByText(/other · as of —/)).toBeInTheDocument();
  });
});
