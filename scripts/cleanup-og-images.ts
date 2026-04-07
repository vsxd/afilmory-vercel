/* eslint-disable no-console */

import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

interface FileInfo {
  name: string
  path: string
  mtime: Date
}

export async function cleanupOldOGImages(keepCount = 3) {
  const publicDir = join(process.cwd(), 'public')

  try {
    const files = await readdir(publicDir)
    const ogImageFiles: FileInfo[] = []

    // 找到所有 OG 图片文件
    for (const file of files) {
      if (file.startsWith('og-image-') && file.endsWith('.png')) {
        const filePath = join(publicDir, file)
        const stats = await stat(filePath)
        ogImageFiles.push({
          name: file,
          path: filePath,
          mtime: stats.mtime,
        })
      }
    }

    // 按修改时间排序（最新的在前）
    ogImageFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    // 删除多余的文件
    const filesToDelete = ogImageFiles.slice(keepCount)

    for (const file of filesToDelete) {
      await unlink(file.path)
      console.info(`🗑️  Deleted old OG image: ${file.name}`)
    }

    if (filesToDelete.length === 0) {
      console.info('✅ No old OG images to clean up')
    } else {
      console.info(`✅ Cleaned up ${filesToDelete.length} old OG images`)
    }

    return filesToDelete.length
  } catch (error) {
    console.error('❌ Error cleaning up OG images:', error)
    throw error
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupOldOGImages().catch(console.error)
}
