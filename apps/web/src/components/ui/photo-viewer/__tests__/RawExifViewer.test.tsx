import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhotoManifest } from "~/types/photo";

import { usePhotoViewerKeyboard } from "../PhotoViewerController";
import { RawExifViewer } from "../RawExifViewer";

const { parse } = vi.hoisted(() => ({ parse: vi.fn<() => Promise<string>>() }));

vi.mock("~/lib/exiftool", () => ({ ExifToolManager: { parse } }));
vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => ({
    imageCache: { get: () => ({ blob: new Blob(["original"]) }) },
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue || key,
  }),
}));
vi.mock("@afilmory/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@afilmory/ui")>();
  return {
    ...actual,
    ScrollArea: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

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

function ViewerHarness({ onClose }: { onClose: () => void }) {
  usePhotoViewerKeyboard({
    isOpen: true,
    onClose,
    onNext: () => {},
    onPrevious: () => {},
  });
  return <RawExifViewer currentPhoto={photo} />;
}

describe("RawExifViewer dismissal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("closes visibly during loading without reopening and limits Escape to the EXIF layer", async () => {
    const firstParse = Promise.withResolvers<string>();
    parse
      .mockReturnValueOnce(firstParse.promise)
      .mockResolvedValue("Make: Sony");
    const onViewerClose = vi.fn();
    render(<ViewerHarness onClose={onViewerClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Raw EXIF Data" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.queryByText("No EXIF data available")).toBeNull();
    await waitFor(() => expect(parse).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Close raw EXIF" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => firstParse.resolve("Make: Canon"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onViewerClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Raw EXIF Data" }));
    expect(await screen.findByText("Sony")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close raw EXIF" }), {
      key: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onViewerClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onViewerClose).toHaveBeenCalledTimes(1);
  });
});
