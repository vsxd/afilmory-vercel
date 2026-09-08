let fileTypeModulePromise: Promise<typeof import("file-type")> | null = null;

async function getFileTypeModule() {
  if (!fileTypeModulePromise) {
    fileTypeModulePromise = import("file-type").catch((error) => {
      fileTypeModulePromise = null;
      throw error;
    });
  }

  return await fileTypeModulePromise;
}

export async function detectFileTypeFromBlob(blob: Blob) {
  const { fileTypeFromBlob } = await getFileTypeModule();
  return await fileTypeFromBlob(blob);
}
