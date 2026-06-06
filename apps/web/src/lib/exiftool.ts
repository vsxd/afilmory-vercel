import { debugLog } from "./debug-log";

class ExifToolManagerStatic {
  private isLoaded = false;

  private exifTool: typeof import("@uswriting/exiftool") | null = null;

  async load(onLoaded?: () => void) {
    if (this.isLoaded) {
      onLoaded?.();
      return;
    }
    const exiftool = await import("@uswriting/exiftool");
    debugLog("ExifTool loaded...");
    this.exifTool = exiftool;
    this.isLoaded = true;

    onLoaded?.();
  }

  async parse(buffer: Blob, filename?: string, onLoaded?: () => void) {
    if (!this.exifTool) {
      await this.load(onLoaded);
    }

    if (!this.exifTool) {
      throw new Error("ExifTool not loaded");
    }
    const metadata = await this.exifTool.parseMetadata(
      new File([buffer], `/afilmory/${filename}`),
    );

    if (metadata.error) {
      throw new Error(metadata.error);
    }

    return metadata.data;
  }
}
export const ExifToolManager = new ExifToolManagerStatic();
