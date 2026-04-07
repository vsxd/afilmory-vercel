/* eslint-disable no-console */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import sharp from 'sharp'

import { measureSVGText, renderSVGText, wrapSVGText } from './svg-text-renderer.js'

async function generateTestImages() {
  const width = 1200
  const height = 630

  // 测试文本
  const testTexts = [
    'Afilmory',
    'Capturing beautiful moments in life, documenting daily warmth and emotions through my lens.',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    '!@#$%^&*()_+-=[]{}|;:,.<>?',
    'The quick brown fox jumps over the lazy dog',
    'Linux 系统字体渲染测试 - Font Rendering Test',
  ]

  // 生成 SVG 文本渲染测试图片
  const svgTextPaths = testTexts
    .map((text, index) => {
      const y = 80 + index * 70
      const fontSize = index < 2 ? 48 : 32
      const fontWeight = index === 0 ? 'bold' : 'normal'

      return renderSVGText(text, 60, y, {
        fontSize,
        fontWeight: fontWeight as 'normal' | 'bold',
        color: 'white',
        letterSpacing: 1,
      })
    })
    .join('')

  const svgTestImage = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f0f0f;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#1a1a1a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <rect width="100%" height="100%" fill="url(#bg)"/>
      
      <!-- SVG 路径绘制的文字 -->
      ${svgTextPaths}
      
      <!-- 标题 -->
      <text x="60" y="40" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.7)">
        SVG Path-based Helvetica Font Rendering (Linux Compatible)
      </text>
    </svg>
  `

  // 生成传统字体渲染对比图片
  const traditionalTestImage = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f0f0f;stop-opacity:1" />
          <stop offset="50%" style="stop-color:#1a1a1a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <rect width="100%" height="100%" fill="url(#bg)"/>
      
      <!-- 传统字体渲染 -->
      <text x="60" y="40" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.7)">
        Traditional Font Rendering (May vary on different systems)
      </text>
      
      <text x="60" y="128" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white">
         Afilmory
      </text>
      
      <text x="60" y="198" font-family="Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.9)">
        Beautiful photo collection and gallery
      </text>
      
      <text x="60" y="268" font-family="Arial, sans-serif" font-size="32" fill="white">
        ABCDEFGHIJKLMNOPQRSTUVWXYZ
      </text>
      
      <text x="60" y="338" font-family="Arial, sans-serif" font-size="32" fill="white">
        abcdefghijklmnopqrstuvwxyz
      </text>
      
      <text x="60" y="408" font-family="Arial, sans-serif" font-size="32" fill="white">
        0123456789
      </text>
      
      <text x="60" y="478" font-family="Arial, sans-serif" font-size="32" fill="white">
        !@#$%^&amp;*()_+-=[]{}|;:,.&lt;&gt;?
      </text>
      
      <text x="60" y="548" font-family="Arial, sans-serif" font-size="32" fill="white">
        The quick brown fox jumps over the lazy dog
      </text>
      
      <text x="60" y="618" font-family="Arial, sans-serif" font-size="32" fill="white">
        Linux 系统字体渲染测试 - Font Rendering Test
      </text>
    </svg>
  `

  try {
    // 生成 SVG 路径版本
    const svgBuffer = await sharp(Buffer.from(svgTestImage)).png().toBuffer()
    const svgPath = join(process.cwd(), 'public', 'test-svg-font-rendering.png')
    writeFileSync(svgPath, svgBuffer)
    console.info(`✅ SVG font test image generated: ${svgPath}`)

    // 生成传统字体版本
    const traditionalBuffer = await sharp(Buffer.from(traditionalTestImage)).png().toBuffer()
    const traditionalPath = join(process.cwd(), 'public', 'test-traditional-font-rendering.png')
    writeFileSync(traditionalPath, traditionalBuffer)
    console.info(`✅ Traditional font test image generated: ${traditionalPath}`)

    // 测试文本测量功能
    console.info('\n📏 Text measurement tests:')
    testTexts.forEach((text, index) => {
      const fontSize = index < 2 ? 48 : 32
      const { width: textWidth, height: textHeight } = measureSVGText(text, {
        fontSize,
      })
      console.info(
        `"${text.slice(0, 30)}${text.length > 30 ? '...' : ''}" - Width: ${Math.round(textWidth)}px, Height: ${Math.round(textHeight)}px`,
      )
    })

    // 测试自动换行功能
    console.info('\n📝 Text wrapping test:')
    const longText =
      'This is a very long text that should be wrapped automatically when it exceeds the maximum width limit that we have set for this test case.'
    const wrappedText = wrapSVGText(longText, 800, { fontSize: 32 })
    console.info(`Original: "${longText}"`)
    console.info(`Wrapped:\n${wrappedText}`)
  } catch (error) {
    console.error('❌ Error generating test images:', error)
    throw error
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTestImages().catch(console.error)
}

export { generateTestImages }
