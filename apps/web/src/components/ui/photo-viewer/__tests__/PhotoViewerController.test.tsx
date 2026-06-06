import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePhotoViewerKeyboard } from "../PhotoViewerController";

function KeyboardHarness({
  onClose,
  onNext,
  onPrevious,
}: {
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  usePhotoViewerKeyboard({
    isOpen: true,
    onClose,
    onNext,
    onPrevious,
  });

  return (
    <div>
      <input data-testid="field" />
    </div>
  );
}

describe("PhotoViewerController", () => {
  afterEach(() => {
    cleanup();
  });

  it("handles viewer keyboard shortcuts outside editable targets", () => {
    const onClose = vi.fn();
    const onNext = vi.fn();
    const onPrevious = vi.fn();

    render(
      <KeyboardHarness
        onClose={onClose}
        onNext={onNext}
        onPrevious={onPrevious}
      />,
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores editable targets and nested overlays", () => {
    const onClose = vi.fn();
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const { getByTestId } = render(
      <KeyboardHarness
        onClose={onClose}
        onNext={onNext}
        onPrevious={onPrevious}
      />,
    );

    getByTestId("field").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    const overlay = document.createElement("div");
    overlay.dataset.photoViewerNestedOverlay = "";
    document.body.append(overlay);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    overlay.remove();

    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
