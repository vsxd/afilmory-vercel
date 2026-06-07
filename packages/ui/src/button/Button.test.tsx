import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("renders loading content without disabling asChild consumers", () => {
    render(
      <Button asChild isLoading loadingText="Saving">
        <a href="/save">Save</a>
      </Button>,
    );

    expect(
      screen.getByRole("link", { name: /saving/i }).getAttribute("href"),
    ).toBe("/save");
  });

  it("disables native buttons while loading", () => {
    render(<Button isLoading>Save</Button>);

    expect(
      (screen.getByRole("button", { name: /loading/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
