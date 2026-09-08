import { isSafari } from "~/lib/device-viewport";

import type { ConversionResult, ImageConverterStrategy } from "../type";

type HeicModule = typeof import("heic-to");

let heicModulePromise: Promise<HeicModule> | null = null;

async function loadHeicModule(): Promise<HeicModule> {
  heicModulePromise ??= import("heic-to").catch((error) => {
    heicModulePromise = null;
    throw error;
  });
  return await heicModulePromise;
}

// Conversion bytes are cached only by the runtime's byte-bounded image cache.
export class HeicConverterStrategy implements ImageConverterStrategy {
  getName(): string {
    return "HEIC";
  }
  getSupportedFormats(): string[] {
    return ["image/heic", "image/heif"];
  }
  async shouldConvert(): Promise<boolean> {
    return !isBrowserSupportHeic();
  }
  async convert(blob: Blob): Promise<ConversionResult> {
    return await convertHeicImage(blob);
  }
}

export interface HeicConversionOptions {
  quality?: number;
  format?: "image/jpeg" | "image/png";
}

export const isBrowserSupportHeic = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const safariVersionMatch = navigator.userAgent.match(/version\/(\d+)/i);
  const versionString = safariVersionMatch?.[1];
  const version = versionString ? Number.parseInt(versionString, 10) : 0;

  return isSafari && version >= 17;
};

export async function convertHeicImage(
  file: Blob,
  options: HeicConversionOptions = {},
): Promise<ConversionResult> {
  const { quality = 1, format = "image/jpeg" } = options;
  const { heicTo } = await loadHeicModule();
  const convertedBlob = await heicTo({ blob: file, type: format, quality });
  return {
    blob: convertedBlob,
    originalSize: file.size,
    convertedSize: convertedBlob.size,
    format,
  };
}
