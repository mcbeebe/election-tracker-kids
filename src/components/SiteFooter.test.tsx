// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  it("credits civicAPI with a link (required for a public site) and states the call rule", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "civicAPI" })).toHaveAttribute("href", "https://civicapi.org");
    expect(screen.getByRole("contentinfo")).toHaveTextContent(/never this app.s projection/);
  });
});
