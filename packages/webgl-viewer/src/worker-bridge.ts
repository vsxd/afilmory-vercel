import TextureWorkerRaw from "./texture.worker?raw";

export class TextureWorkerBridge {
  private readonly workerUrl: string;
  private readonly worker: Worker;

  constructor(input: {
    onMessage: (event: MessageEvent) => void;
    onError?: (event: ErrorEvent) => void;
  }) {
    this.workerUrl = URL.createObjectURL(new Blob([TextureWorkerRaw]));
    this.worker = new Worker(this.workerUrl, {
      name: "texture-worker",
    });
    this.worker.onmessage = input.onMessage;
    this.worker.onerror =
      input.onError ??
      ((event) => {
        console.error("[Worker] Error:", event.message, event.error);
      });
  }

  loadImage(input: { url: string; blob: Blob | null }): void {
    this.worker.postMessage({
      type: "load-image",
      payload: input,
    });
  }

  createTile(input: {
    x: number;
    y: number;
    lodLevel: number;
    lodConfig: { scale: number };
    imageWidth: number;
    imageHeight: number;
    key: string;
  }): void {
    this.worker.postMessage({
      type: "create-tile",
      payload: input,
    });
  }

  dispose(): void {
    this.worker.terminate();
    URL.revokeObjectURL(this.workerUrl);
  }
}
