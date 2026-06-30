import { beforeEach, describe, expect, it, vi } from "vitest";

import { detectFileTypeFromBlob } from "../file-type";

// Hoisted mock so the dynamic `import("file-type")` inside the module under
// test resolves to a controllable stub instead of loading the real package.
const { fileTypeFromBlob } = vi.hoisted(() => ({
  fileTypeFromBlob: vi.fn(),
}));

vi.mock("file-type", () => ({ fileTypeFromBlob }));

describe("detectFileTypeFromBlob", () => {
  beforeEach(() => {
    fileTypeFromBlob.mockReset();
  });

  const makeBlob = () => new Blob(["x"], { type: "application/octet-stream" });

  it("delegates to fileTypeFromBlob and returns its detection result", async () => {
    const detection = { ext: "jpg", mime: "image/jpeg" };
    fileTypeFromBlob.mockResolvedValue(detection);

    const blob = makeBlob();
    const result = await detectFileTypeFromBlob(blob);

    expect(result).toEqual(detection);
    expect(fileTypeFromBlob).toHaveBeenCalledTimes(1);
    expect(fileTypeFromBlob).toHaveBeenCalledWith(blob);
  });

  it("returns undefined when the detector cannot identify the blob", async () => {
    fileTypeFromBlob.mockResolvedValue();

    const result = await detectFileTypeFromBlob(makeBlob());

    expect(result).toBeUndefined();
  });

  it("delegates again on subsequent calls (cached module, fresh detection)", async () => {
    fileTypeFromBlob.mockResolvedValue({ ext: "png", mime: "image/png" });

    await detectFileTypeFromBlob(makeBlob());
    await detectFileTypeFromBlob(makeBlob());

    expect(fileTypeFromBlob).toHaveBeenCalledTimes(2);
  });

  it("propagates rejections from the underlying detector", async () => {
    fileTypeFromBlob.mockRejectedValue(new Error("decode failed"));

    await expect(detectFileTypeFromBlob(makeBlob())).rejects.toThrow(
      "decode failed",
    );
  });
});
