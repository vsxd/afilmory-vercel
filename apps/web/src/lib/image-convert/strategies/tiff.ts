import { isMobileDevice, isSafari } from "~/lib/device-viewport";

import { abortable, createAbortError } from "../../abortable";
import { MediaTaskError } from "../../media-task";
import type { ConversionResult, ImageConverterStrategy } from "../type";
import type { TiffDecodeBudget } from "./tiff-limits";
import {
  assertTiffInputSize,
  DESKTOP_TIFF_BUDGET,
  MOBILE_TIFF_BUDGET,
} from "./tiff-limits";
import type {
  TiffWorkerRequest,
  TiffWorkerResponse,
} from "./tiff-worker-protocol";

export const TIFF_CONVERSION_TIMEOUT_MS = 60_000;

export class TiffConverterStrategy implements ImageConverterStrategy {
  private readonly budget = isMobileDevice
    ? MOBILE_TIFF_BUDGET
    : DESKTOP_TIFF_BUDGET;

  getName(): string {
    return "TIFF";
  }
  getSupportedFormats(): string[] {
    return ["image/tiff", "image/tif"];
  }
  async shouldConvert(blob: Blob): Promise<boolean> {
    // Native support must not bypass the same admission limit. Do not restrict
    // native Safari to the pixel layouts supported by the JS decoder.
    if (isSafari) await this.inspect(blob);
    return !isSafari;
  }

  private async inspect(
    blob: Blob,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    signal?.throwIfAborted();
    assertTiffInputSize(blob.size, this.budget);
    const work = async () => {
      const { inspectTiff } = await import("./tiff-decode");
      const bytes = await blob.arrayBuffer();
      signal?.throwIfAborted();
      inspectTiff(bytes, this.budget);
      return bytes;
    };
    // A header/module failure cannot safely fall back to an unbudgeted native
    // decode. Successful inspection precedes both worker and canvas paths.
    try {
      return await (signal ? abortable(work(), signal) : work());
    } catch (cause) {
      signal?.throwIfAborted();
      if (cause instanceof MediaTaskError) throw cause;
      throw new MediaTaskError(
        "detect",
        "invalid-image",
        "TIFF inspection failed",
        { cause },
      );
    }
  }

  async convert(
    blob: Blob,
    _originalUrl?: string,
    signal?: AbortSignal,
  ): Promise<ConversionResult> {
    const bytes = await this.inspect(blob, signal);
    signal?.throwIfAborted();
    const result =
      typeof Worker === "function" && typeof OffscreenCanvas === "function"
        ? await convertWithWorker(bytes, this.budget, signal)
        : await convertWithCanvas(bytes, this.budget, signal);
    return {
      ...result,
      originalSize: blob.size,
      convertedSize: result.blob.size,
    };
  }
}

function convertWithWorker(
  bytes: ArrayBuffer,
  budget: TiffDecodeBudget,
  signal?: AbortSignal,
): Promise<{ blob: Blob; format: string }> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(new URL("tiff.worker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", cancel);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      callback();
    };
    const cancel = () =>
      finish(() => reject(createAbortError("TIFF conversion cancelled")));
    worker.onmessage = ({ data }: MessageEvent<TiffWorkerResponse>) => {
      finish(() => {
        if (data.type === "converted")
          resolve({ blob: data.blob, format: data.format });
        else
          reject(
            new MediaTaskError(
              "convert",
              data.code,
              "TIFF worker conversion failed",
            ),
          );
      });
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new Error("TIFF conversion worker failed")));
    };
    worker.onmessageerror = () =>
      finish(() =>
        reject(new Error("TIFF worker returned an unreadable result")),
      );
    signal?.addEventListener("abort", cancel, { once: true });
    const deadline = setTimeout(
      () =>
        finish(() =>
          reject(
            new MediaTaskError(
              "convert",
              "timeout",
              "TIFF conversion worker did not finish before its deadline",
            ),
          ),
        ),
      TIFF_CONVERSION_TIMEOUT_MS,
    );
    try {
      worker.postMessage({ bytes, budget } satisfies TiffWorkerRequest, [
        bytes,
      ]);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function convertWithCanvas(
  bytes: ArrayBuffer,
  budget: TiffDecodeBudget,
  signal?: AbortSignal,
): Promise<{ blob: Blob; format: string }> {
  const { paintTiff } = await import("./tiff-decode");
  signal?.throwIfAborted();
  const { canvas, format } = paintTiff(bytes, budget, (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
  try {
    const encoded = new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Failed to encode converted TIFF"));
        },
        format,
        0.9,
      );
    });
    const blob = await (signal ? abortable(encoded, signal) : encoded);
    return { blob, format };
  } finally {
    // Release the fallback canvas backing even when encoding or its caller fails.
    canvas.width = 0;
    canvas.height = 0;
  }
}
