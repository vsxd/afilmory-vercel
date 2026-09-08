import type { TileKey } from "./tile-cache";

export type TextureWorkerSessionId = number;

/** Both ends consume these unions; transferable ownership passes only after postMessage succeeds. */
export type TextureWorkerRequest =
  | {
      type: "load-image";
      payload: {
        sessionId: TextureWorkerSessionId;
        url: string;
        blob: Blob | null;
        /** gl.MAX_TEXTURE_SIZE of the target context; 0 means unknown. */
        maxTextureSize: number;
        maxTextureBytes: number;
      };
    }
  | {
      type: "create-tile";
      payload: {
        sessionId: TextureWorkerSessionId;
        x: number;
        y: number;
        lodLevel: number;
        imageWidth: number;
        imageHeight: number;
        key: TileKey;
      };
    };

export type TextureWorkerMessage =
  | { type: "init-done"; sessionId: TextureWorkerSessionId }
  | {
      type: "image-loaded";
      sessionId: TextureWorkerSessionId;
      payload: {
        imageBitmap: ImageBitmap;
        imageWidth: number;
        imageHeight: number;
        lodLevel: number;
      };
    }
  | {
      type: "load-error";
      sessionId: TextureWorkerSessionId;
      payload: { error: string };
    }
  | {
      type: "tile-created";
      sessionId: TextureWorkerSessionId;
      payload: { key: TileKey; imageBitmap: ImageBitmap; lodLevel: number };
    }
  | {
      type: "tile-error";
      sessionId: TextureWorkerSessionId;
      payload: { key: TileKey; error: string };
    };
