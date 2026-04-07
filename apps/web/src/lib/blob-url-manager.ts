import { useEffect, useRef, useState } from 'react'

/**
 * Blob URL 管理工具
 * 用于安全地管理 URL.createObjectURL 和 URL.revokeObjectURL，防止内存泄漏
 */

export class BlobUrlManager {
  private urls = new Set<string>()

  /**
   * 创建 blob URL 并自动追踪
   */
  createUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob)
    this.urls.add(url)
    return url
  }

  /**
   * 手动释放指定的 URL
   */
  revokeUrl(url: string): void {
    if (this.urls.has(url)) {
      try {
        URL.revokeObjectURL(url)
        this.urls.delete(url)
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error)
      }
    }
  }

  /**
   * 释放所有追踪的 URL
   */
  revokeAll(): void {
    for (const url of this.urls) {
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error)
      }
    }
    this.urls.clear()
  }

  /**
   * 获取当前追踪的 URL 数量
   */
  getCount(): number {
    return this.urls.size
  }
}

/**
 * React Hook: 用于在组件中安全管理 blob URLs
 */
export function useBlobUrlManager() {
  const managerRef = useRef<BlobUrlManager | null>(null)

  if (!managerRef.current) {
    managerRef.current = new BlobUrlManager()
  }

  // 组件卸载时自动清理所有 URL
  useEffect(() => {
    return () => {
      managerRef.current?.revokeAll()
    }
  }, [])

  return managerRef.current
}

/**
 * React Hook: 用于单个 blob URL 的管理
 */
export function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const currentUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current)
      currentUrlRef.current = null
    }

    if (!blob) {
      setUrl(null)
      return
    }

    const newUrl = URL.createObjectURL(blob)
    currentUrlRef.current = newUrl
    setUrl(newUrl)

    return () => {
      if (currentUrlRef.current === newUrl) {
        URL.revokeObjectURL(newUrl)
        currentUrlRef.current = null
      }
    }
  }, [blob])

  return url
}
