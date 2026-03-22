/**
 * 从 URL 或文件路径中提取图片格式
 * @param url - 图片的 URL 或文件路径
 * @returns 图片格式的大写字符串，如 'JPG', 'HEIC', 'PNG' 等
 */
export const getImageFormat = (url: string): string => {
  if (!url) return 'UNKNOWN'

  const sanitizedUrl = url.split('?')[0]?.split('#')[0] ?? url
  const extension = sanitizedUrl.split('.').pop()?.toUpperCase()
  return extension || 'UNKNOWN'
}

/**
 * 格式化文件大小为可读的字符串
 * @param bytes - 文件大小（字节）
 * @param decimals - 小数位数，默认为 1
 * @returns 格式化后的文件大小字符串，如 '21.1MB'
 */
export const formatFileSize = (bytes: number, decimals = 1): string => {
  if (bytes === 0) return '0B'

  const k = 1024
  const dm = Math.max(decimals, 0)
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm))}${sizes[i]}`
}

/**
 * 检查是否为支持的图片格式
 * @param format - 图片格式字符串
 * @returns 是否为支持的图片格式
 */
export const isSupportedImageFormat = (format: string): boolean => {
  const supportedFormats = [
    'JPG',
    'JPEG',
    'PNG',
    'WEBP',
    'GIF',
    'BMP',
    'SVG',
    'HEIC',
    'HEIF',
    'HIF',
    'AVIF',
    'TIFF',
    'TIF',
  ]

  return supportedFormats.includes(format.toUpperCase())
}

/**
 * 获取图片格式的显示名称
 * @param format - 图片格式字符串
 * @returns 格式化后的显示名称
 */
export const getImageFormatDisplayName = (format: string): string => {
  const formatMap: Record<string, string> = {
    JPG: 'JPEG',
    JPEG: 'JPEG',
    HEIC: 'HEIC',
    HIF: 'HEIF',
    HEIF: 'HEIF',
    PNG: 'PNG',
    WEBP: 'WebP',
    GIF: 'GIF',
    BMP: 'BMP',
    SVG: 'SVG',
    AVIF: 'AVIF',
    TIFF: 'TIFF',
    TIF: 'TIFF',
  }

  return formatMap[format.toUpperCase()] || format.toUpperCase()
}
