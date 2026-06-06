import { decompressUint8Array } from "@afilmory/data";
import { render } from "@testing-library/react";
import { thumbHashToDataURL } from "thumbhash";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Thumbhash } from "../index";

vi.mock("@afilmory/data", () => ({
  decompressUint8Array: vi.fn(
    (value: string) => new Uint8Array([value.length]),
  ),
}));

vi.mock("thumbhash", () => ({
  thumbHashToDataURL: vi.fn(
    (value: ArrayLike<number>) =>
      `data:image/png;base64,${Array.from(value).join("-")}`,
  ),
}));

describe("Thumbhash", () => {
  beforeEach(() => {
    vi.mocked(decompressUint8Array).mockClear();
    vi.mocked(thumbHashToDataURL).mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reuses the decoded data URL for repeated string hashes", () => {
    const { rerender } = render(
      <Thumbhash thumbHash="cached-string-hash" className="first" />,
    );

    rerender(<Thumbhash thumbHash="cached-string-hash" className="second" />);

    expect(decompressUint8Array).toHaveBeenCalledTimes(1);
    expect(thumbHashToDataURL).toHaveBeenCalledTimes(1);
  });

  it("reuses the decoded data URL for repeated object hashes", () => {
    const thumbHash = new Uint8Array([1, 2, 3]);
    const { rerender } = render(
      <Thumbhash thumbHash={thumbHash} className="first" />,
    );

    rerender(<Thumbhash thumbHash={thumbHash} className="second" />);

    expect(decompressUint8Array).not.toHaveBeenCalled();
    expect(thumbHashToDataURL).toHaveBeenCalledTimes(1);
  });
});
