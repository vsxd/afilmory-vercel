import { describe, expect, it } from "vitest";

import { selectDisplayImage } from "../display-image";

const variants = [960, 1600, 2560].map((width) => ({
  url: `${width}.jpg`,
  width,
  height: (width * 2) / 3,
}));
const photo = { width: 6000, height: 4000, displayImages: variants };

describe("viewer display image selection", () => {
  it("fits the photo to CSS bounds and caps high-DPR phones at the canvas DPR", () => {
    expect(
      selectDisplayImage(photo, { width: 390, height: 700, dpr: 3 })?.url,
    ).toBe("960.jpg");
    expect(
      selectDisplayImage(photo, { width: 1200, height: 800, dpr: 1 })?.url,
    ).toBe("1600.jpg");
    expect(
      selectDisplayImage(photo, { width: 1400, height: 900, dpr: 2 })?.url,
    ).toBe("2560.jpg");
  });

  it("uses both portrait dimensions and selects the largest available for larger displays", () => {
    const portrait = {
      width: 4000,
      height: 6000,
      displayImages: variants.map((v) => ({
        ...v,
        width: v.height,
        height: v.width,
      })),
    };
    expect(
      selectDisplayImage(portrait, { width: 390, height: 700, dpr: 2 })?.url,
    ).toBe("1600.jpg");
    expect(
      selectDisplayImage(photo, { width: 4000, height: 3000, dpr: 2 })?.url,
    ).toBe("2560.jpg");
  });

  it("keeps legacy, HDR, video and invalid-size photos on their original path", () => {
    const viewport = { width: 390, height: 700, dpr: 2 };
    expect(
      selectDisplayImage({ ...photo, displayImages: undefined }, viewport),
    ).toBeUndefined();
    expect(
      selectDisplayImage({ ...photo, isHDR: true }, viewport),
    ).toBeUndefined();
    expect(
      selectDisplayImage({ ...photo, video: { type: "live-photo" } }, viewport),
    ).toBeUndefined();
    expect(
      selectDisplayImage({ ...photo, width: 0 }, viewport),
    ).toBeUndefined();
  });
});
