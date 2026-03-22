import { describe, expect, it } from 'vitest'

import { createEmptyManifest, parseManifest } from '../manifest'
import { CURRENT_MANIFEST_VERSION } from '../version'

describe('manifest', () => {
  describe('createEmptyManifest', () => {
    it('should return a manifest with the current version', () => {
      const manifest = createEmptyManifest()
      expect(manifest.version).toBe(CURRENT_MANIFEST_VERSION)
    })

    it('should return empty arrays for data, cameras, and lenses', () => {
      const manifest = createEmptyManifest()
      expect(manifest.data).toEqual([])
      expect(manifest.cameras).toEqual([])
      expect(manifest.lenses).toEqual([])
    })
  })

  describe('parseManifest', () => {
    it('should parse a valid manifest', () => {
      const input = {
        version: 'v5',
        data: [{ id: 'photo-1' }],
        cameras: [{ make: 'Canon', model: 'EOS R5', displayName: 'Canon EOS R5' }],
        lenses: [{ model: 'RF 50mm F1.2L', displayName: 'Canon RF 50mm F1.2L' }],
      }
      const result = parseManifest(input)
      expect(result.version).toBe('v5')
      expect(result.data).toEqual([{ id: 'photo-1' }])
      expect(result.cameras).toHaveLength(1)
      expect(result.lenses).toHaveLength(1)
    })

    it('should return an empty manifest for null input', () => {
      const result = parseManifest(null)
      expect(result.version).toBe(CURRENT_MANIFEST_VERSION)
      expect(result.data).toEqual([])
      expect(result.cameras).toEqual([])
      expect(result.lenses).toEqual([])
    })

    it('should return an empty manifest for undefined input', () => {
      const result = parseManifest()
      expect(result.version).toBe(CURRENT_MANIFEST_VERSION)
      expect(result.data).toEqual([])
    })

    it('should return an empty manifest for non-object input', () => {
      const result = parseManifest('not an object')
      expect(result.version).toBe(CURRENT_MANIFEST_VERSION)
      expect(result.data).toEqual([])
    })

    it('should handle empty object input', () => {
      const result = parseManifest({})
      expect(result.version).toBe(CURRENT_MANIFEST_VERSION)
      expect(result.data).toEqual([])
      expect(result.cameras).toEqual([])
      expect(result.lenses).toEqual([])
    })

    it('should use current version when version is missing', () => {
      const result = parseManifest({ data: [] })
      expect(result.version).toBe(CURRENT_MANIFEST_VERSION)
    })

    it('should use current version when version is not a string', () => {
      const result = parseManifest({ version: 123 })
      expect(result.version).toBe(CURRENT_MANIFEST_VERSION)
    })

    it('should handle non-array data, cameras, lenses fields', () => {
      const result = parseManifest({
        version: 'v1',
        data: 'not-an-array',
        cameras: null,
        lenses: 42,
      })
      expect(result.version).toBe('v1')
      expect(result.data).toEqual([])
      expect(result.cameras).toEqual([])
      expect(result.lenses).toEqual([])
    })

    it('should preserve version string across versions (migration scenario)', () => {
      const oldManifest = parseManifest({ version: 'v1', data: [] })
      expect(oldManifest.version).toBe('v1')

      const currentManifest = parseManifest({ version: CURRENT_MANIFEST_VERSION, data: [] })
      expect(currentManifest.version).toBe(CURRENT_MANIFEST_VERSION)
    })
  })
})
