import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "../clipboard-text";

function installExecCommandMock(result: boolean) {
  const execCommand = vi.fn(() => result);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
  });
  return execCommand;
}

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("uses the Clipboard API first", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    const execCommand = installExecCommandMock(true);

    await expect(
      copyTextToClipboard("https://example.com/photo", {
        document,
        navigator: {
          clipboard: { writeText },
        },
      }),
    ).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("https://example.com/photo");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to selection copy when Clipboard API fails", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("clipboard denied");
    });
    const execCommand = installExecCommandMock(true);

    await expect(
      copyTextToClipboard("fallback text", {
        document,
        navigator: {
          clipboard: { writeText },
        },
      }),
    ).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("fallback text");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("restores focus after selection fallback", async () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    installExecCommandMock(true);

    await expect(
      copyTextToClipboard("fallback text", {
        document,
        navigator: {},
      }),
    ).resolves.toBe(true);

    expect(document.activeElement).toBe(button);
  });

  it("returns false when both copy paths are unavailable", async () => {
    installExecCommandMock(false);

    await expect(
      copyTextToClipboard("uncopied text", {
        document,
        navigator: {},
      }),
    ).resolves.toBe(false);
  });
});
