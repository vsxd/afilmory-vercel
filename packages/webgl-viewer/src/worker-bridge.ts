import type {
  TextureWorkerMessage,
  TextureWorkerRequest,
} from "./worker-protocol";

export class TextureWorkerBridge {
  private readonly worker: Worker;
  private disposed = false;

  constructor(input: {
    onMessage: (event: MessageEvent<TextureWorkerMessage>) => void;
    onError?: (event: ErrorEvent) => void;
    onMessageError?: (event: MessageEvent<unknown>) => void;
  }) {
    this.worker = new Worker(new URL("texture.worker.ts", import.meta.url), {
      type: "module",
      name: "texture-worker",
    });
    this.worker.onmessage = input.onMessage;
    this.worker.onerror =
      input.onError ??
      ((event) => {
        console.error("[Worker] Error:", event.message, event.error);
      });
    this.worker.onmessageerror =
      input.onMessageError ??
      ((event) => {
        console.error("[Worker] Message error:", event.data);
      });
  }

  loadImage(
    input: Extract<TextureWorkerRequest, { type: "load-image" }>["payload"],
  ): void {
    this.postMessage({ type: "load-image", payload: input });
  }

  createTile(
    input: Extract<TextureWorkerRequest, { type: "create-tile" }>["payload"],
  ): void {
    this.postMessage({ type: "create-tile", payload: input });
  }

  private postMessage(message: TextureWorkerRequest): void {
    if (this.disposed) throw new Error("Texture worker is disposed");
    this.worker.postMessage(message);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Retain the receiver: already transferred bitmaps can still arrive after
    // terminate(), and the destroyed engine closes them without rendering.
    this.worker.onerror = null;
    this.worker.onmessageerror = null;
    this.worker.terminate();
  }
}
