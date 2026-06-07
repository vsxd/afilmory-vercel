interface ClipboardLike {
  writeText?: (text: string) => Promise<void>;
}

interface NavigatorClipboardLike {
  clipboard?: ClipboardLike;
}

interface CopyTextToClipboardOptions {
  document?: Document;
  navigator?: NavigatorClipboardLike;
}

function getBrowserNavigator(): NavigatorClipboardLike | undefined {
  return typeof navigator === "undefined" ? undefined : navigator;
}

function getBrowserDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function restoreSelection(selection: Selection | null, ranges: Range[]): void {
  if (!selection) {
    return;
  }

  selection.removeAllRanges();
  for (const range of ranges) {
    selection.addRange(range);
  }
}

function restoreFocus(doc: Document, activeElement: Element | null): void {
  const HTMLElementCtor = doc.defaultView?.HTMLElement;
  if (!HTMLElementCtor || !(activeElement instanceof HTMLElementCtor)) {
    return;
  }

  activeElement.focus({ preventScroll: true });
}

function copyTextWithSelectionFallback(text: string, doc: Document): boolean {
  if (!doc.body || typeof doc.execCommand !== "function") {
    return false;
  }

  const { activeElement } = doc;
  const selection = doc.getSelection();
  const ranges: Range[] = [];
  if (selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      ranges.push(selection.getRangeAt(index).cloneRange());
    }
  }

  const textarea = doc.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto 0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  doc.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return doc.execCommand("copy");
  } finally {
    textarea.remove();
    restoreSelection(selection, ranges);
    restoreFocus(doc, activeElement);
  }
}

export async function copyTextToClipboard(
  text: string,
  options: CopyTextToClipboardOptions = {},
): Promise<boolean> {
  const targetNavigator = options.navigator ?? getBrowserNavigator();
  const writeText = targetNavigator?.clipboard?.writeText;

  if (writeText) {
    try {
      await writeText(text);
      return true;
    } catch {
      // Fall through to the selection-based copy path for constrained browsers.
    }
  }

  const targetDocument = options.document ?? getBrowserDocument();
  return targetDocument
    ? copyTextWithSelectionFallback(text, targetDocument)
    : false;
}
