// @vitest-environment node

import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@afilmory/ui", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  ScrollArea: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ScrollElementContext: ({
    children,
  }: PropsWithChildren<{ value: HTMLElement | null }>) => <>{children}</>,
}));

vi.mock("@pkg", () => ({
  repository: {
    url: "https://example.com/repo",
  },
}));

vi.mock("jotai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jotai")>();

  return {
    ...actual,
    useAtomValue: () => ({
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: [],
      selectedGeoCountries: [],
      selectedGeoRegions: [],
      selectedGeoCities: [],
      selectedGeoDistricts: [],
    }),
    useSetAtom: () => vi.fn(),
  };
});

vi.mock("react-router", () => ({
  Outlet: () => null,
  isRouteErrorResponse: () => false,
  useLocation: () => ({
    pathname: "/",
    search: "",
    hash: "",
    state: null,
    key: "root",
  }),
  useNavigate: () => vi.fn(),
  useNavigationType: () => "POP",
  useParams: () => ({}),
  useRouteError: () =>
    new Error("Failed to fetch dynamically imported module: /assets/chunk.js"),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("~/atoms/app", () => ({
  gallerySettingAtom: {},
}));

vi.mock("~/config", () => ({
  siteConfig: {
    accentColor: "",
  },
}));

vi.mock("~/hooks/useMobile", () => ({
  useMobile: () => true,
}));

// ErrorElement resolves labels via the module-global i18n instance;
// key-identity t() keeps this suite about SSR safety, not translation.
vi.mock("~/i18n", () => ({
  getI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("~/hooks/usePhotoViewer", () => ({
  getFilteredPhotos: () => [],
  useIsPhotoViewerOpen: () => false,
  usePhotoViewer: () => ({
    currentIndex: 0,
    closeViewer: vi.fn(),
    goToIndex: vi.fn(),
    isOpen: false,
    openViewer: vi.fn(),
  }),
  usePhotoViewerBodyScrollLock: vi.fn(),
  usePhotos: () => [],
}));

vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => ({ id: "ssr-runtime" }),
}));

vi.mock("~/modules/gallery/MasonryRoot", () => ({
  MasonryRoot: () => <div>masonry</div>,
}));

vi.mock("~/providers/photos-provider", () => ({
  PhotosProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));

describe("apps/web SSR safety", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("imports NavigationController without touching window at module evaluation time", async () => {
    await expect(import("../navigation/controller")).resolves.toBeDefined();
  });

  it("renders the main layout without document access during render", async () => {
    const { Component } = await import("../pages/(main)/layout");

    expect(renderToStaticMarkup(<Component />)).toContain("masonry");
  });

  it("renders the route error element without sessionStorage access during render", async () => {
    const { ErrorElement } = await import("../components/common/ErrorElement");

    expect(renderToStaticMarkup(<ErrorElement />)).toContain("error.title");
  });
});
