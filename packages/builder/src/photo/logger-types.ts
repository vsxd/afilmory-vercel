export interface PhotoLogger {
  info: (message: string, ...args: any[]) => void
  warn: (message: string, ...args: any[]) => void
  error: (message: string, error?: any) => void
  success: (message: string, ...args: any[]) => void
}

export interface PhotoProcessingLoggers {
  image: PhotoLogger
  s3: PhotoLogger
  thumbnail: PhotoLogger
  blurhash: PhotoLogger
  exif: PhotoLogger
  tone: PhotoLogger
  location: PhotoLogger
}
