import type { CameraInfo, LensInfo } from "@afilmory/schema";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestNavigation } from "~/navigation/__tests__/test-router";
import type { NavigationController } from "~/navigation/controller";

import { FilterPanel } from "../panels/FilterPanel";

const cameraName = "SONY ILCE-7CM2 full-frame interchangeable lens camera";
const lensName = "SONY FE 70-200mm F2.8 GM OSS II, SEL70200GM2";
const similarLensName = "SONY FE 70-200mm F2.8 GM OSS, SEL70200GM";
const cameras: CameraInfo[] = [
  { make: "SONY", model: cameraName, displayName: cameraName },
];
const lenses: LensInfo[] = [
  { make: "SONY", model: lensName, displayName: lensName },
  { make: "SONY", model: similarLensName, displayName: similarLensName },
];
let navigation: NavigationController;

vi.mock("@afilmory/ui", () => ({
  clsxm: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => ({ navigation }),
  usePhotoRepositorySnapshot: () => [],
  usePhotoRepository: () => ({
    getAllTags: () => ["travel"],
    getAllCameras: () => cameras,
    getAllLenses: () => lenses,
  }),
}));

describe("FilterPanel equipment controls", () => {
  beforeEach(() => {
    navigation = createTestNavigation("/?tags=travel&sort=asc").navigation;
  });
  afterEach(cleanup);

  it("keeps full equipment names distinct and writes the original filter IDs", () => {
    render(<FilterPanel />);
    const cameraGroup = screen.getByRole("region", {
      name: "action.camera.filter",
    });
    const lensGroup = screen.getByRole("region", {
      name: "action.lens.filter",
    });
    const camera = within(cameraGroup).getByRole("button", {
      name: cameraName,
    });
    const lens = within(lensGroup).getByRole("button", { name: lensName });
    const similarLens = within(lensGroup).getByRole("button", {
      name: similarLensName,
    });

    fireEvent.click(camera);
    fireEvent.click(lens);

    expect(camera.getAttribute("aria-pressed")).toBe("true");
    expect(lens.getAttribute("aria-pressed")).toBe("true");
    expect(similarLens.getAttribute("aria-pressed")).toBe("false");
    expect(navigation.getGallerySettings()).toMatchObject({
      selectedTags: ["travel"],
      selectedCameras: [cameraName],
      selectedLenses: [lensName],
      sortOrder: "asc",
    });
    const search = new URLSearchParams(navigation.getLocation().search);
    expect(search.getAll("cameras")).toEqual([cameraName]);
    // A comma in the lens name must remain part of one ID after URL roundtrip.
    expect(navigation.getGallerySettings().selectedLenses).toEqual([lensName]);

    fireEvent.click(lens);
    expect(lens.getAttribute("aria-pressed")).toBe("false");
    expect(navigation.getGallerySettings().selectedLenses).toEqual([]);
    expect(navigation.getGallerySettings().selectedCameras).toEqual([
      cameraName,
    ]);
  });
});
