type PreparedCommandPalette = typeof import("./CommandPalette").CommandPalette;

let prepared: PreparedCommandPalette | undefined;

export async function loadCommandPalette(): Promise<void> {
  prepared = (await import("./CommandPalette")).CommandPalette;
}

export function getPreparedCommandPalette(): PreparedCommandPalette {
  if (!prepared) throw new Error("Search module has not been prepared.");
  return prepared;
}
