import { isSafari } from "~/lib/device-viewport";

import type { ConversionResult, ImageConverterStrategy } from "../type";
import { tiffPixelsToRgba } from "./tiff-pixels";

export class TiffConverterStrategy implements ImageConverterStrategy {
  getName(): string {
    return "TIFF";
  }
  getSupportedFormats(): string[] {
    return ["image/tiff", "image/tif"];
  }
  async shouldConvert(): Promise<boolean> {
    return !isSafari;
  }

  async convert(blob: Blob): Promise<ConversionResult> {
    const { decode } = await import("tiff");
    const frame = decode(await blob.arrayBuffer())[0];
    if (!frame) throw new Error("Failed to decode TIFF image");
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Failed to get canvas context");
    const image = context.createImageData(frame.width, frame.height);
    tiffPixelsToRgba(frame, image.data);
    context.putImageData(image, 0, 0);

    // JPEG cannot carry alpha. Preserve transparent TIFF pixels losslessly;
    // opaque images keep the existing JPEG quality and memory tradeoff.
    const format = frame.alpha ? "image/png" : "image/jpeg";
    const converted = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Failed to encode converted TIFF"));
        },
        format,
        0.9,
      );
    });
    return {
      blob: converted,
      format,
      originalSize: blob.size,
      convertedSize: converted.size,
    };
  }
}
