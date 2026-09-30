import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.doUnmock("./CommandPalette");
  vi.resetModules();
});

it("prepares code without mounting a dialog, then renders synchronously on first use", async () => {
  const renderPalette = vi.fn(() => <div role="dialog">Search ready</div>);
  vi.doMock("./CommandPalette", () => ({ CommandPalette: renderPalette }));
  const { loadCommandPalette, getPreparedCommandPalette } =
    await import("./load");
  expect(() => getPreparedCommandPalette()).toThrow("has not been prepared");

  await loadCommandPalette();
  expect(renderPalette).not.toHaveBeenCalled();
  const CommandPalette = getPreparedCommandPalette();
  render(<CommandPalette isOpen onClose={() => {}} />);
  // No async find/wait: preparation must eliminate a first-use Suspense retry.
  expect(screen.getByRole("dialog").textContent).toBe("Search ready");
  await loadCommandPalette();
  expect(getPreparedCommandPalette()).toBe(CommandPalette);
});
