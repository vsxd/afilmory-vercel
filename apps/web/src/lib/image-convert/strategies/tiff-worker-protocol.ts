import type { TiffDecodeBudget } from "./tiff-limits";

export interface TiffWorkerRequest {
  bytes: ArrayBuffer;
  budget: TiffDecodeBudget;
}

export type TiffWorkerResponse =
  | { type: "converted"; blob: Blob; format: string }
  | {
      type: "error";
      code: "resource-limit" | "conversion-failed" | "invalid-image";
    };
