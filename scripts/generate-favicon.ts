import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path, { join } from 'node:path'

import sharp from 'sharp'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

// 创建圆角遮罩
function createRoundedCornersMask(size: number, cornerRadius: number) {
  const r = cornerRadius
  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/>
    </svg>
  `
}

// 为图片添加圆角
async function addRoundedCorners(imageBuffer: Buffer, size: number): Promise<Buffer> {
  // 计算圆角半径，约为尺寸的 12%
  const cornerRadius = Math.round(size * 0.12)

  const maskSvg = createRoundedCornersMask(size, cornerRadius)
  const maskBuffer = Buffer.from(maskSvg)

  return sharp(imageBuffer)
    .composite([
      {
        input: maskBuffer,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer()
}

// 生成不同尺寸的 favicon
export async function generateFavicons() {
  const logoPath = join(__dirname, '../logo.png')
  const outputDir = join(process.cwd(), 'public')

  // 检查 logo 文件是否存在
  if (!existsSync(logoPath)) {
    throw new Error('Logo file not found: logo.png')
  }

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const sizes = [
    { size: 16, name: 'favicon-16x16.png' },
    { size: 32, name: 'favicon-32x32.png' },
    { size: 48, name: 'favicon-48x48.png' },
    { size: 180, name: 'apple-touch-icon.png' },
    { size: 192, name: 'android-chrome-192x192.png' },
    { size: 512, name: 'android-chrome-512x512.png' },
  ]

  try {
    // 读取原始 logo 图片
    const logoBuffer = await sharp(logoPath).png().toBuffer()

    // 生成各种尺寸的 PNG 文件
    for (const { size, name } of sizes) {
      const resizedBuffer = await sharp(logoBuffer)
        .resize(size, size, {
          fit: 'cover',
          position: 'center',
        })
        .png({
          quality: 100,
          compressionLevel: 6,
        })
        .toBuffer()

      // 添加圆角效果
      const roundedBuffer = await addRoundedCorners(resizedBuffer, size)

      const outputPath = join(outputDir, name)
      writeFileSync(outputPath, roundedBuffer)
      console.info(`✅ Generated favicon: ${name} (${size}x${size})`)
    }

    // 生成主 favicon.ico（使用 32x32）
    const faviconResizedBuffer = await sharp(logoBuffer)
      .resize(32, 32, {
        fit: 'cover',
        position: 'center',
      })
      .png({
        quality: 100,
        compressionLevel: 6,
      })
      .toBuffer()

    // 为 favicon.ico 添加圆角
    const faviconBuffer = await addRoundedCorners(faviconResizedBuffer, 32)

    const faviconPath = join(outputDir, 'favicon.ico')
    writeFileSync(faviconPath, faviconBuffer)
    console.info(`✅ Generated main favicon: favicon.ico`)

    // PWA manifest 由 vite-plugin-pwa 生成，这里不再生成重复的文件

    console.info(`🎨 All favicons generated successfully from logo.png with rounded corners!`)
  } catch (error) {
    console.error('❌ Error generating favicons:', error)
    throw error
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  generateFavicons().catch(console.error)
}
