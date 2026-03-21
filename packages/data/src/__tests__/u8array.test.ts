import { describe, expect, it } from 'vitest'

import { compressUint8Array, decompressUint8Array } from '../u8array'

describe('u8array', () => {
  it('should compress and decompress roundtrip', () => {
    const original = new Uint8Array([0, 127, 255, 1, 128])
    const compressed = compressUint8Array(original)
    const decompressed = decompressUint8Array(compressed)
    expect(decompressed).toEqual(original)
  })

  it('should compress to hex string', () => {
    const input = new Uint8Array([0, 15, 255])
    expect(compressUint8Array(input)).toBe('000fff')
  })

  it('should handle empty array', () => {
    const original = new Uint8Array([])
    const compressed = compressUint8Array(original)
    expect(compressed).toBe('')
  })
})
