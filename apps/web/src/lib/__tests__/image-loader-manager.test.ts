import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ImageLoaderManager } from '../image-loader-manager'

vi.mock('~/lib/debug-log', () => ({
  debugLog: vi.fn(),
}))

vi.mock('~/lib/file-type', () => ({
  detectFileTypeFromBlob: vi.fn(async () => ({
    ext: 'jpg',
    mime: 'image/jpeg',
  })),
}))

vi.mock('~/lib/image-convert', () => ({
  imageConverterManager: {
    convertImage: vi.fn(async () => null),
  },
}))

vi.mock('~/i18n', () => ({
  i18nAtom: Symbol('i18nAtom'),
}))

vi.mock('~/lib/motion-photo-extractor', () => ({
  extractMotionPhotoVideo: vi.fn(),
}))

vi.mock('~/lib/video-converter', () => ({
  convertMovToMp4: vi.fn(),
  needsVideoConversion: vi.fn(() => false),
}))

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = []

  onabort: (() => void) | null = null
  onerror: (() => void) | null = null
  onload: (() => void) | null = null
  onprogress: ((event: ProgressEvent) => void) | null = null
  response: Blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
  responseType = ''
  status = 200

  open = vi.fn()
  send = vi.fn()
  setRequestHeader = vi.fn()

  constructor() {
    MockXMLHttpRequest.instances.push(this)
  }
}

describe('ImageLoaderManager', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalXMLHttpRequest = globalThis.XMLHttpRequest

  beforeEach(() => {
    vi.useFakeTimers()
    MockXMLHttpRequest.instances = []

    globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest
    URL.createObjectURL = vi.fn(() => 'blob:mock-image')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.XMLHttpRequest = originalXMLHttpRequest
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    vi.restoreAllMocks()
  })

  it('keeps high-resolution image requests CORS-simple by avoiding custom request headers', async () => {
    const manager = new ImageLoaderManager()
    const resultPromise = manager.loadImage('https://img.misfork.com/afilmory/A7C02615.jpg')

    await vi.advanceTimersByTimeAsync(300)

    const xhr = MockXMLHttpRequest.instances[0]
    expect(xhr).toBeDefined()
    expect(xhr.setRequestHeader).not.toHaveBeenCalled()

    xhr.onload?.()

    await expect(resultPromise).resolves.toEqual({ blobSrc: 'blob:mock-image' })
  })
})
