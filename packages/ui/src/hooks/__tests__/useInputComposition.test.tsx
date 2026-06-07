import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useInputComposition } from "../useInputComposition";

describe("useInputComposition", () => {
  it("forwards composition events and suppresses keydown while composing", () => {
    const onCompositionStart = vi.fn();
    const onCompositionEnd = vi.fn();
    const onKeyDown = vi.fn();

    function TestInput() {
      const composition = useInputComposition<HTMLInputElement>({
        onCompositionEnd,
        onCompositionStart,
        onKeyDown,
      });
      const { isCompositionRef: _isCompositionRef, ...inputProps } =
        composition;
      return <input aria-label="name" {...inputProps} />;
    }

    render(<TestInput />);
    const input = screen.getByLabelText("name");
    const composingKeydown = new KeyboardEvent("keydown", {
      bubbles: true,
      key: "a",
    });
    const stopPropagation = vi.spyOn(composingKeydown, "stopPropagation");

    fireEvent.compositionStart(input);
    input.dispatchEvent(composingKeydown);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCompositionStart).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onCompositionEnd).toHaveBeenCalledTimes(1);
  });
});
