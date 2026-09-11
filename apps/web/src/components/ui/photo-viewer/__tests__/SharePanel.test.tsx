import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhotoManifest } from "~/types/photo";

import { SharePanel } from "../SharePanel";

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn<() => Promise<boolean>>(),
}));
vi.mock("../clipboard-text", () => ({ copyTextToClipboard }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const photo: PhotoManifest = {
  id: "photo",
  title: "Original",
  description: "",
  dateTaken: "2026-09-11T00:00:00.000Z",
  tags: [],
  originalUrl: "/originals/photo.jpg",
  thumbnailUrl: "/thumbnails/photo.jpg",
  thumbHash: null,
  width: 4000,
  height: 3000,
  aspectRatio: 4 / 3,
  s3Key: "photo.jpg",
  lastModified: "2026-09-11T00:00:00.000Z",
  size: 1024,
  exif: null,
  toneAnalysis: null,
  location: null,
};

describe("SharePanel keyboard actions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens and navigates the share menu with the keyboard, then copies the photo link", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    render(
      <SharePanel
        photo={photo}
        trigger={<button type="button">Share</button>}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Share" }), {
      key: "ArrowDown",
    });
    const firstItem = await screen.findByRole("menuitem", { name: "Twitter" });
    await waitFor(() => expect(document.activeElement).toBe(firstItem));
    fireEvent.keyDown(firstItem, { key: "ArrowDown" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "Facebook" }),
      ),
    );

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    const copyLink = screen.getByRole("menuitem", {
      name: "photo.share.copy.link",
    });
    await waitFor(() => expect(document.activeElement).toBe(copyLink));
    fireEvent.keyDown(copyLink, { key: "Enter" });
    await waitFor(() =>
      expect(copyTextToClipboard).toHaveBeenCalledWith(
        `${window.location.origin}/photos/photo`,
      ),
    );
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});
