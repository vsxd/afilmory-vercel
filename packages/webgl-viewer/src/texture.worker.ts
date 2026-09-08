import { createTextureWorkerHandler } from "./texture-worker-runtime";
import type { TextureWorkerRequest } from "./worker-protocol";

declare const self: DedicatedWorkerGlobalScope;

const handleMessage = createTextureWorkerHandler((message, transfer = []) => {
  self.postMessage(message, transfer);
});
self.onmessage = (event: MessageEvent<TextureWorkerRequest>) => {
  void handleMessage(event.data);
};
