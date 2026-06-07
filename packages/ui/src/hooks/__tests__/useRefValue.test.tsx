import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useRefValue } from "../useRefValue";

describe("useRefValue", () => {
  it("keeps the ref current value in sync after rerender", () => {
    const seen: number[] = [];

    function Probe({ value }: { value: number }) {
      const ref = useRefValue(value);
      seen.push(ref.current);
      return null;
    }

    const { rerender } = render(<Probe value={1} />);
    rerender(<Probe value={2} />);
    rerender(<Probe value={3} />);

    expect(seen).toEqual([1, 1, 2]);
  });
});
