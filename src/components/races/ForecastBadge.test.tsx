// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NormalizedForecast } from "@/lib/providers/types";
import { ForecastBadge } from "./ForecastBadge";

const forecast: NormalizedForecast = {
  source: "civicapi",
  pundit: "civicAPI",
  chamber: "house",
  lastUpdated: "2026-11-03",
  fetchedAt: "t",
  entries: { "CA-07": { rating: "Safe D", d: 97.4, r: 2.6, i: 0 } },
};

describe("ForecastBadge", () => {
  it("shows the rating and win chance, and tells screen readers it is not a result", () => {
    render(<ForecastBadge forecast={forecast} forecastKey="CA-07" />);
    expect(screen.getByText("Safe D · D 97%")).toBeInTheDocument();
    expect(screen.getByText(/rated this Safe D, with a 97% chance for the Democrat\. Not a result\./)).toBeInTheDocument();
  });

  it("renders nothing without a forecast or a matching entry", () => {
    const { container, rerender } = render(<ForecastBadge forecastKey="CA-07" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ForecastBadge forecast={forecast} forecastKey="TX-38" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ForecastBadge forecast={{ ...forecast, entries: undefined as unknown as NormalizedForecast["entries"] }} forecastKey="CA-07" />);
    expect(container).toBeEmptyDOMElement();
  });
});
