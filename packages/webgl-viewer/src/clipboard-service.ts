export async function copyImageUrlToClipboard(src: string): Promise<boolean> {
  const response = await fetch(src);
  const blob = await response.blob();

  if (!navigator.clipboard || !navigator.clipboard.write) {
    return false;
  }

  const clipboardItem = new ClipboardItem({ [blob.type]: blob });
  await navigator.clipboard.write([clipboardItem]);
  return true;
}
