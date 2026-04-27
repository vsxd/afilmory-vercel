import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CompatibleLoggerAdapter } from '@afilmory/builder/photo/logger-adapter.js'
import consola from 'consola'

import { SUPPORTED_FORMATS } from '../../constants/index.js'
import { logger } from '../../logger/index.js'
import type { LocalConfig, StorageObject, StorageProvider, StorageUploadOptions } from '../interfaces'
import { joinPublicUrl } from '../url.js'

export interface ScanProgress {
  currentPath: string
  filesScanned: number
  totalFiles?: number
}

export type ProgressCallback = (progress: ScanProgress) => void

export class LocalStorageProvider implements StorageProvider {
  private config: LocalConfig
  private basePath: string
  private distPath?: string
  private distInitialization: Promise<void> | null = null
  private distInitializationError: unknown = null
  private scanProgress: ScanProgress = {
    currentPath: '',
    filesScanned: 0,
  }

  private logger = new CompatibleLoggerAdapter(consola.withTag('LOCAL'))

  constructor(config: LocalConfig) {
    if (!config.basePath || config.basePath.trim() === '') {
      throw new Error('LocalStorageProvider: basePath 不能为空')
    }

    if (config.maxFileLimit && config.maxFileLimit <= 0) {
      throw new Error('LocalStorageProvider: maxFileLimit 必须大于 0')
    }

    if (config.excludeRegex) {
      try {
        new RegExp(config.excludeRegex)
      } catch (error) {
        throw new Error(`LocalStorageProvider: excludeRegex 不是有效的正则表达式: ${error}`)
      }
    }

    this.config = config

    // 处理相对路径和绝对路径
    if (path.isAbsolute(config.basePath)) {
      this.basePath = config.basePath
    } else {
      // 相对于项目根目录
      const __dirname = path.dirname(fileURLToPath(import.meta.url))
      const projectRoot = path.resolve(__dirname, '../../../../../')
      this.basePath = path.resolve(projectRoot, config.basePath)
    }

    // 处理 distPath（可选）
    if (config.distPath && config.distPath.trim() !== '') {
      if (path.isAbsolute(config.distPath)) {
        this.distPath = config.distPath
      } else {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const projectRoot = path.resolve(__dirname, '../../../../../')
        this.distPath = path.resolve(projectRoot, config.distPath)
      }
      this.distInitialization = copyToDist(this.basePath, this.distPath).catch((error: unknown) => {
        this.distInitializationError = error
      })
    }
  }

  async getFile(key: string): Promise<Buffer | null> {
    try {
      this.logger.info(`读取本地文件：${key}`)
      const startTime = Date.now()

      const filePath = this.resolveLexicallySafePath(key)

      // 检查文件是否存在
      try {
        await fs.access(filePath)
      } catch {
        this.logger.warn(`文件不存在：${key}`)
        return null
      }

      const safeFilePath = await this.resolveExistingSafePath(key)
      const buffer = await fs.readFile(safeFilePath)

      const duration = Date.now() - startTime
      const sizeKB = Math.round(buffer.length / 1024)
      this.logger.success(`读取完成：${key} (${sizeKB}KB, ${duration}ms)`)

      return buffer
    } catch (error) {
      const errorType = error instanceof Error ? error.name : 'UnknownError'
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`[${errorType}] 读取文件失败：${key} - ${errorMessage}`)
      return null
    }
  }

  async listImages(): Promise<StorageObject[]> {
    const allFiles = await this.listAllFiles()

    // 过滤出图片文件
    return allFiles.filter((file) => {
      const ext = path.extname(file.key).toLowerCase()
      return SUPPORTED_FORMATS.has(ext)
    })
  }

  async listAllFiles(progressCallback?: ProgressCallback): Promise<StorageObject[]> {
    const files: StorageObject[] = []
    const excludeRegex = this.config.excludeRegex ? new RegExp(this.config.excludeRegex) : null

    // 重置进度
    this.scanProgress = {
      currentPath: '',
      filesScanned: 0,
    }

    await this.scanDirectory(this.basePath, '', files, excludeRegex, progressCallback)

    // 应用文件数量限制
    if (this.config.maxFileLimit && files.length > this.config.maxFileLimit) {
      logger.main.info(`文件数量超过限制 ${this.config.maxFileLimit}，截取前 ${this.config.maxFileLimit} 个文件`)
      return files.slice(0, this.config.maxFileLimit)
    }

    return files
  }

  private resolveLexicallySafePath(key: string): string {
    const filePath = path.join(this.basePath, key)
    const resolvedPath = path.resolve(filePath)
    const resolvedBasePath = path.resolve(this.basePath)
    const relativePath = path.relative(resolvedBasePath, resolvedPath)

    if (relativePath === '' || relativePath === '.') {
      throw new Error(`LocalStorageProvider: 文件路径不安全：${key}`)
    }

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`LocalStorageProvider: 文件路径不安全：${key}`)
    }

    return resolvedPath
  }

  private async getRealBasePath(): Promise<string> {
    return await fs.realpath(this.basePath)
  }

  private assertPathInsideBase(
    key: string,
    realBasePath: string,
    realTargetPath: string,
    options: { allowBase?: boolean } = {},
  ): void {
    const relativePath = path.relative(realBasePath, realTargetPath)

    if (relativePath === '' || relativePath === '.') {
      if (options.allowBase) {
        return
      }
      throw new Error(`LocalStorageProvider: 文件路径不安全：${key}`)
    }

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`LocalStorageProvider: 文件路径不安全：${key}`)
    }
  }

  private async resolveExistingSafePath(key: string): Promise<string> {
    const resolvedPath = this.resolveLexicallySafePath(key)
    const [realBasePath, realTargetPath] = await Promise.all([this.getRealBasePath(), fs.realpath(resolvedPath)])

    this.assertPathInsideBase(key, realBasePath, realTargetPath)
    return realTargetPath
  }

  private async resolveWritableSafePath(key: string): Promise<string> {
    const resolvedPath = this.resolveLexicallySafePath(key)
    const resolvedBasePath = path.resolve(this.basePath)
    const realBasePath = await this.getRealBasePath()
    let existingAncestor = path.dirname(resolvedPath)

    while (true) {
      const relativeAncestor = path.relative(resolvedBasePath, existingAncestor)
      if (relativeAncestor.startsWith('..') || path.isAbsolute(relativeAncestor)) {
        throw new Error(`LocalStorageProvider: 文件路径不安全：${key}`)
      }

      try {
        const stat = await fs.lstat(existingAncestor)
        if (stat.isSymbolicLink()) {
          throw new Error(`LocalStorageProvider: 文件路径不安全：${key}`)
        }
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }

        const parent = path.dirname(existingAncestor)
        if (parent === existingAncestor) {
          throw error
        }
        existingAncestor = parent
      }
    }

    const realAncestorPath = await fs.realpath(existingAncestor)
    this.assertPathInsideBase(key, realBasePath, realAncestorPath, { allowBase: true })

    const targetDir = path.dirname(resolvedPath)
    await fs.mkdir(targetDir, { recursive: true })
    const realTargetDir = await fs.realpath(targetDir)
    this.assertPathInsideBase(key, realBasePath, realTargetDir, { allowBase: true })

    return resolvedPath
  }

  private async syncDistFile(key: string, sourcePath: string): Promise<void> {
    if (!this.distPath) {
      return
    }

    await this.ensureDistInitialized()
    const distFilePath = path.join(this.distPath, key)
    const distDir = path.dirname(distFilePath)
    await fs.mkdir(distDir, { recursive: true })
    await fs.copyFile(sourcePath, distFilePath)
  }

  private async removeDistFile(key: string): Promise<void> {
    if (!this.distPath) {
      return
    }

    await this.ensureDistInitialized()
    const distFilePath = path.join(this.distPath, key)
    try {
      await fs.rm(distFilePath, { force: true })
    } catch (error) {
      this.logger.warn(`删除 dist 文件失败：${distFilePath}`, error)
    }
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = this.resolveLexicallySafePath(key)

    try {
      try {
        await this.resolveExistingSafePath(key)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
      await fs.rm(filePath, { force: true })
      await this.removeDistFile(key)
      this.logger.success(`已删除本地文件：${key}`)
    } catch (error) {
      this.logger.error(`删除本地文件失败：${key}`, error)
      throw error
    }
  }

  async uploadFile(key: string, data: Buffer, _options?: StorageUploadOptions): Promise<StorageObject> {
    const filePath = await this.resolveWritableSafePath(key)

    try {
      await fs.writeFile(filePath, data)
      await this.syncDistFile(key, filePath)

      const stats = await fs.stat(filePath)

      return {
        key,
        size: stats.size,
        lastModified: stats.mtime,
      }
    } catch (error) {
      this.logger.error(`上传本地文件失败：${key}`, error)
      throw error
    }
  }

  private async scanDirectory(
    dirPath: string,
    relativePath: string,
    files: StorageObject[],
    excludeRegex?: RegExp | null,
    progressCallback?: ProgressCallback,
  ): Promise<void> {
    try {
      // 更新进度
      this.scanProgress.currentPath = relativePath || '/'
      progressCallback?.(this.scanProgress)

      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        const relativeFilePath = relativePath ? path.join(relativePath, entry.name).replaceAll('\\', '/') : entry.name

        // 应用排除规则
        if (excludeRegex && excludeRegex.test(relativeFilePath)) {
          continue
        }

        if (entry.isDirectory()) {
          // 递归扫描子目录
          await this.scanDirectory(fullPath, relativeFilePath, files, excludeRegex, progressCallback)
        } else if (entry.isFile()) {
          try {
            const stats = await fs.stat(fullPath)

            files.push({
              key: relativeFilePath,
              size: stats.size,
              lastModified: stats.mtime,
              etag: this.generateETag(stats),
            })

            // 更新已扫描文件数
            this.scanProgress.filesScanned++
            if (this.scanProgress.filesScanned % 100 === 0) {
              // 每 100 个文件报告一次进度
              progressCallback?.(this.scanProgress)
            }
          } catch (error) {
            const errorType = error instanceof Error ? error.name : 'UnknownError'
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.main.warn(`[${errorType}] 获取文件信息失败：${relativeFilePath} - ${errorMessage}`)
          }
        }
      }
    } catch (error) {
      const errorType = error instanceof Error ? error.name : 'UnknownError'
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.main.error(`[${errorType}] 扫描目录失败：${dirPath} - ${errorMessage}`)
    }
  }

  private async ensureDistInitialized(): Promise<void> {
    if (!this.distInitialization) {
      return
    }

    await this.distInitialization
    if (this.distInitializationError) {
      throw this.distInitializationError
    }
  }

  async generatePublicUrl(key: string): Promise<string> {
    await this.ensureDistInitialized()

    if (this.config.baseUrl) {
      // 如果配置了基础 URL，生成完整的 HTTP URL
      return joinPublicUrl(this.config.baseUrl, key)
    }

    if (this.distPath) {
      return joinPublicUrl(`/${path.basename(this.distPath)}`, key)
    }

    throw new Error('LocalStorageProvider: baseUrl 或 distPath 必须配置，否则无法生成静态站点可访问的公共 URL')
  }

  detectLivePhotos(allObjects: StorageObject[]): Map<string, StorageObject> {
    const livePhotos = new Map<string, StorageObject>()

    // 创建一个映射来快速查找文件
    const fileMap = new Map<string, StorageObject>()
    allObjects.forEach((obj) => {
      fileMap.set(obj.key.toLowerCase(), obj)
    })

    // 查找 Live Photos 配对
    allObjects.forEach((obj) => {
      const ext = path.extname(obj.key).toLowerCase()

      // 如果是图片文件，查找对应的视频文件
      if (SUPPORTED_FORMATS.has(ext)) {
        // use path.parse to get the name without extension to avoid issues
        // when the file extension has different casing (e.g. .HEIC)
        const baseName = path.parse(obj.key).name
        const dirName = path.dirname(obj.key)

        // 查找对应的 .mov 文件
        const videoKey = path.join(dirName, `${baseName}.mov`).replaceAll('\\', '/')
        const videoObj = fileMap.get(videoKey.toLowerCase())

        if (videoObj) {
          livePhotos.set(obj.key, videoObj)
        }
      }
    })

    return livePhotos
  }

  /**
   * 生成文件的 ETag
   */
  private generateETag(stats: Stats): string {
    return `${stats.mtime.getTime()}-${stats.size}`
  }

  /**
   * 获取本地存储的基础路径
   */
  getBasePath(): string {
    return this.basePath
  }

  /**
   * 检查基础路径是否存在
   */
  async checkBasePath(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.basePath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * 创建基础路径目录（如果不存在）
   */
  async ensureBasePath(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true })
      logger.main.info(`创建本地存储目录：${this.basePath}`)
    } catch (error) {
      const errorType = error instanceof Error ? error.name : 'UnknownError'
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.main.error(`[${errorType}] 创建本地存储目录失败：${this.basePath} - ${errorMessage}`)
      throw error
    }
  }
}

/**
 * 将文件夹复制到 dist 目录（保持相对路径结构）。
 */
async function copyToDist(fromPath: string, distPath: string): Promise<void> {
  try {
    // 确保目标目录存在
    await fs.mkdir(distPath, { recursive: true })
    await fs.cp(fromPath, distPath, {
      recursive: true,
      force: true,
    })

    logger.main.log(`LocalStorageProvider: 已复制文件到发布目录： ${fromPath} -> ${distPath}`)
  } catch (error) {
    logger.main.error(`LocalStorageProvider: basePath: ${fromPath}, distPath: ${distPath}, 错误: ${error}`)
    throw error
  }
}
