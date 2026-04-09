// @vitest-environment node

import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@afilmory/ui', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  ScrollArea: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ScrollElementContext: ({ children }: PropsWithChildren<{ value: HTMLElement | null }>) => <>{children}</>,
}))

vi.mock('@pkg', () => ({
  repository: {
    url: 'https://example.com/repo',
  },
}))

vi.mock('jotai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jotai')>()

  return {
    ...actual,
    useAtomValue: () => ({
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: [],
      selectedRatings: null,
      tagFilterMode: 'union',
    }),
    useSetAtom: () => vi.fn(),
  }
})

vi.mock('react-router', () => ({
  Outlet: () => null,
  isRouteErrorResponse: () => false,
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'root' }),
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useRouteError: () => new Error('Failed to fetch dynamically imported module: /assets/chunk.js'),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('~/atoms/app', () => ({
  gallerySettingAtom: {},
}))

vi.mock('~/config', () => ({
  siteConfig: {
    accentColor: '',
  },
}))

vi.mock('~/hooks/useMobile', () => ({
  useMobile: () => true,
}))

vi.mock('~/hooks/usePhotoViewer', () => ({
  getFilteredPhotos: () => [],
  usePhotoViewer: () => ({
    currentIndex: 0,
    isOpen: false,
    openViewer: vi.fn(),
  }),
  usePhotos: () => [],
}))

vi.mock('~/modules/gallery/MasonryRoot', () => ({
  MasonryRoot: () => <div>masonry</div>,
}))

vi.mock('~/providers/photos-provider', () => ({
  PhotosProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}))

describe('apps/web SSR safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('imports StableRouterProvider without touching window at module evaluation time', async () => {
    await expect(import('../providers/stable-router-provider')).resolves.toBeDefined()
  })

  it('renders the main layout without document access during render', async () => {
    const { Component } = await import('../pages/(main)/layout')

    expect(renderToStaticMarkup(<Component />)).toContain('masonry')
  })

  it('renders the route error element without sessionStorage access during render', async () => {
    const { ErrorElement } = await import('../components/common/ErrorElement')

    expect(renderToStaticMarkup(<ErrorElement />)).toContain('Something went wrong')
  })
})
