import { decompressUint8Array } from '@afilmory/data'
import { thumbHashToDataURL } from 'thumbhash'

const BG_HEX = '#1c1c1e'

export type RGB = { r: number; g: number; b: number }

export const hexToRgb = (hex: string): RGB | null => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  return {
    r: Number.parseInt(m[1], 16),
    g: Number.parseInt(m[2], 16),
    b: Number.parseInt(m[3], 16),
  }
}

export const rgbToHex = ({ r, g, b }: RGB): string => {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Relative luminance (WCAG)
export const luminance = ({ r, g, b }: RGB): number => {
  const srgb = [r, g, b].map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!
}

export const contrastRatio = (c1: RGB, c2: RGB): number => {
  const L1 = luminance(c1)
  const L2 = luminance(c2)
  const [a, b] = L1 >= L2 ? [L1, L2] : [L2, L1]
  return (a + 0.05) / (b + 0.05)
}

// Linearly blend two colors
export const mix = (a: RGB, b: RGB, t: number): RGB => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
})

// Clamp accent to a contrast range against BG
export const clampAccentContrast = (
  accent: RGB,
  bgHex: string = BG_HEX,
  { min = 2.2, max = 4.5 }: { min?: number; max?: number } = {},
): RGB => {
  const bg = hexToRgb(bgHex) ?? { r: 28, g: 28, b: 30 }
  const cr = contrastRatio(accent, bg)
  if (cr >= min && cr <= max) return accent

  // Try pulling towards bg to reduce too-high contrast (too bright)
  if (cr > max) {
    for (let t = 0.05; t <= 1; t += 0.05) {
      const candidate = mix(accent, bg, t)
      const c = contrastRatio(candidate, bg)
      if (c <= max) return candidate
    }
    return mix(accent, bg, 0.8)
  }
  // Too low contrast → move away from bg towards white
  const white = { r: 255, g: 255, b: 255 }
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = mix(accent, white, t)
    const c = contrastRatio(candidate, bg)
    if (c >= min) return candidate
  }
  return mix(accent, white, 0.8)
}

export const averageColorFromImage = (img: HTMLImageElement): string | null => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const w = 16
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w))
  canvas.width = w
  canvas.height = h
  ctx.drawImage(img, 0, 0, w, h)
  try {
    const { data } = ctx.getImageData(0, 0, w, h)
    let r = 0,
      g = 0,
      b = 0,
      count = 0
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]
      if (alpha === 0) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }
    if (count === 0) return null
    r = Math.round(r / count)
    g = Math.round(g / count)
    b = Math.round(b / count)
    const clamped = clampAccentContrast({ r, g, b })
    return rgbToHex(clamped)
  } catch {
    return null
  }
}

export const dataUrlFromThumbhash = (thumbHash: string): string | null => {
  try {
    return thumbHashToDataURL(decompressUint8Array(thumbHash))
  } catch {
    return null
  }
}

export const deriveAccentFromSources = async (opts: {
  thumbHash?: string | null
  thumbnailUrl?: string | null
}): Promise<string | null> => {
  const { thumbHash, thumbnailUrl } = opts

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })

  let src: string | null = null
  if (thumbHash && typeof thumbHash === 'string') {
    src = dataUrlFromThumbhash(thumbHash)
  }
  if (!src && thumbnailUrl) {
    src = thumbnailUrl
  }
  if (!src) return null

  try {
    const img = await loadImage(src)
    return averageColorFromImage(img)
  } catch {
    return null
  }
}
