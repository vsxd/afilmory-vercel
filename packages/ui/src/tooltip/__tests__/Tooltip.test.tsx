import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "..";

afterEach(cleanup);

describe("Tooltip", () => {
  it("describes the focused trigger and dismisses on Escape without moving focus", async () => {
    render(
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button">Details</button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>Camera settings</TooltipContent>
        </TooltipPortal>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Details" });
    act(() => trigger.focus());

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("Camera settings");
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);

    fireEvent.keyDown(trigger, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
  });
});
