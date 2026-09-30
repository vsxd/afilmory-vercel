import { MediaTaskError } from "../../media-task";
import { paintTiff } from "./tiff-decode";
import type {
  TiffWorkerRequest,
  TiffWorkerResponse,
} from "./tiff-worker-protocol";

// A small structural boundary avoids adding Worker globals to the DOM app.
declare const self: {
  onmessage: ((event: MessageEvent<TiffWorkerRequest>) => void) | null;
  postMessage: (message: TiffWorkerResponse) => void;
};

self.onmessage = async ({ data }) => {
  try {
    const { canvas, format } = paintTiff(
      data.bytes,
      data.budget,
      (width, height) => new OffscreenCanvas(width, height),
    );
    const blob = await canvas.convertToBlob({ type: format, quality: 0.9 });
    self.postMessage({ type: "converted", blob, format });
  } catch (error) {
    self.postMessage({
      type: "error",
      code:
        error instanceof MediaTaskError &&
        (error.code === "resource-limit" || error.code === "invalid-image")
          ? error.code
          : "conversion-failed",
    });
  }
};
