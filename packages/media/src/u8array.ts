export const compressUint8Array = (uint8Array: Uint8Array) => {
  return Array.from(uint8Array, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

export const decompressUint8Array = (compressed: string) => {
  const bytes = compressed
    .match(/.{1,2}/g)
    ?.map((byte) => Number.parseInt(byte, 16));

  return Uint8Array.from(bytes ?? []);
};
