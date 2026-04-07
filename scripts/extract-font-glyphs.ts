/* eslint-disable no-console */

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import opentype from 'opentype.js'

interface GlyphData {
  path: string
  width: number
  height: number
  advanceWidth: number
}

// 常用字符集
const CHARACTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  ' ',
  '.',
  ',',
  '!',
  '?',
  ':',
  ';',
  '-',
  '(',
  ')',
  '[',
  ']',
  '/',
  '&',
  '@',
  '#',
  '$',
  '%',
  '*',
  '+',
  '=',
  '<',
  '>',
  '|',
  '\\',
  '~',
  '`',
  "'",
  '{',
  '}',
]
const __dirname = fileURLToPath(new URL('.', import.meta.url))
// 常见的无衬线字体路径（优先使用 TTF 格式）
const HELVETICA_FONT_PATHS = [
  join(__dirname, './SF-Pro-Display-Medium.ttf'),
  '/System/Library/Fonts/SFCompact.ttf',
  '/System/Library/Fonts/Geneva.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Helvetica.ttf',
  '/Library/Fonts/Helvetica.ttf',
]

function findHelveticaFont(): string | null {
  for (const fontPath of HELVETICA_FONT_PATHS) {
    if (existsSync(fontPath)) {
      console.info('Found font:', fontPath)
      return fontPath
    }
  }
  return null
}

function normalizeGlyphPath(path: opentype.Path, unitsPerEm: number): string {
  const scale = 100 / unitsPerEm
  const commands: string[] = []

  path.commands.forEach((cmd) => {
    switch (cmd.type) {
      case 'M': {
        commands.push(`M ${(cmd.x * scale).toFixed(1)} ${(100 - cmd.y * scale).toFixed(1)}`)
        break
      }
      case 'L': {
        commands.push(`L ${(cmd.x * scale).toFixed(1)} ${(100 - cmd.y * scale).toFixed(1)}`)
        break
      }
      case 'C': {
        commands.push(
          `C ${(cmd.x1 * scale).toFixed(1)} ${(100 - cmd.y1 * scale).toFixed(1)} ${(cmd.x2 * scale).toFixed(
            1,
          )} ${(100 - cmd.y2 * scale).toFixed(1)} ${(cmd.x * scale).toFixed(1)} ${(100 - cmd.y * scale).toFixed(1)}`,
        )
        break
      }
      case 'Q': {
        commands.push(
          `Q ${(cmd.x1 * scale).toFixed(1)} ${(100 - cmd.y1 * scale).toFixed(1)} ${(cmd.x * scale).toFixed(
            1,
          )} ${(100 - cmd.y * scale).toFixed(1)}`,
        )
        break
      }
      case 'Z': {
        commands.push('Z')
        break
      }
    }
  })

  return commands.join(' ')
}

async function extractGlyphs(): Promise<Record<string, GlyphData>> {
  const fontPath = findHelveticaFont()

  if (!fontPath) {
    throw new Error('Helvetica font not found.')
  }

  console.info('Loading font from:', fontPath)

  const font = await opentype.load(fontPath)
  console.info('Font loaded:', font.names.fontFamily?.en || 'Unknown')

  const glyphs: Record<string, GlyphData> = {}
  const { unitsPerEm } = font

  for (const char of CHARACTERS) {
    const glyph = font.charToGlyph(char)

    if (glyph && glyph.path) {
      const path = normalizeGlyphPath(glyph.path, unitsPerEm)
      const advanceWidth = (glyph.advanceWidth / unitsPerEm) * 100

      glyphs[char] = {
        path,
        width: advanceWidth,
        height: 100,
        advanceWidth,
      }

      console.info('Extracted glyph for:', char, 'width:', advanceWidth.toFixed(1))
    } else {
      console.warn('No glyph found for character:', char)
      if (char === ' ') {
        glyphs[char] = {
          path: '',
          width: 25,
          height: 100,
          advanceWidth: 25,
        }
      }
    }
  }

  return glyphs
}

function generateSVGTextRenderer(glyphs: Record<string, GlyphData>): string {
  const glyphEntries = Object.entries(glyphs)
    .map(([char, data]) => {
      const escapedChar = char === "'" ? "\\'" : char === '\\' ? '\\\\' : char
      return `  '${escapedChar}': {
    path: '${data.path}',
    width: ${data.width.toFixed(1)},
    height: ${data.height},
    advanceWidth: ${data.advanceWidth.toFixed(1)}
  }`
    })
    .join(',\n')

  return `// SVG 文本渲染器 - 基于真实 Helvetica 字体提取的字形
// 自动生成，请勿手动编辑

interface CharacterPath {
  path: string
  width: number
  height: number
  advanceWidth: number
}

const HELVETICA_CHARACTERS: Record<string, CharacterPath> = {
${glyphEntries}
}

interface SVGTextOptions {
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  color?: string
  letterSpacing?: number
  lineHeight?: number
}

export function renderSVGText(
  text: string,
  x: number,
  y: number,
  options: SVGTextOptions = {}
): string {
  const {
    fontSize = 48,
    fontWeight = 'normal',
    color = 'white',
    letterSpacing = 0,
    lineHeight = 1.2
  } = options

  const scale = fontSize / 100
  const lines = text.split('\\n')
  
  let svgPaths = ''
  
  lines.forEach((line, lineIndex) => {
    let currentX = x
    const currentY = y + (lineIndex * fontSize * lineHeight)
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const charData = HELVETICA_CHARACTERS[char] || HELVETICA_CHARACTERS[' ']
      
      if (charData.path) {
        const scaledPath = charData.path.replace(/([\\d.-]+)/g, (match) => {
          const num = parseFloat(match)
          return (num * scale).toFixed(1)
        })
        
        svgPaths += '<g transform="translate(' + currentX + ', ' + currentY + ')">'
        svgPaths += '<path d="' + scaledPath + '" fill="' + color + '"'
        if (fontWeight === 'bold') {
          svgPaths += ' stroke="' + color + '" stroke-width="' + (1.5 * scale) + '"'
        }
        svgPaths += ' stroke-linejoin="round" />'
        svgPaths += '</g>'
      }
      
      currentX += (charData.advanceWidth * scale) + letterSpacing
    }
  })
  
  return svgPaths
}

export function measureSVGText(
  text: string,
  options: SVGTextOptions = {}
): { width: number; height: number } {
  const {
    fontSize = 48,
    letterSpacing = 0,
    lineHeight = 1.2
  } = options

  const scale = fontSize / 100
  const lines = text.split('\\n')
  
  let maxWidth = 0
  const height = lines.length * fontSize * lineHeight
  
  lines.forEach(line => {
    let lineWidth = 0
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const charData = HELVETICA_CHARACTERS[char] || HELVETICA_CHARACTERS[' ']
      lineWidth += (charData.advanceWidth * scale) + letterSpacing
    }
    maxWidth = Math.max(maxWidth, lineWidth - letterSpacing)
  })
  
  return { width: maxWidth, height }
}

export function wrapSVGText(
  text: string,
  maxWidth: number,
  options: SVGTextOptions = {}
): string {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''
  
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word
    const { width } = measureSVGText(testLine, options)
    
    if (width <= maxWidth) {
      currentLine = testLine
    } else {
      if (currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        lines.push(word)
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine)
  }
  
  return lines.join('\\n')
}
`
}

async function main() {
  try {
    console.info('Searching for Helvetica font...')
    const glyphs = await extractGlyphs()

    console.info('Generating SVG text renderer with', Object.keys(glyphs).length, 'glyphs...')
    const rendererCode = generateSVGTextRenderer(glyphs)

    const originalPath = join(process.cwd(), 'scripts', 'svg-text-renderer.ts')

    writeFileSync(originalPath, rendererCode)
    console.info('New SVG text renderer generated:', originalPath)

    console.info('Font extraction completed successfully!')
  } catch (error) {
    console.error('Font extraction failed:', error)
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { extractGlyphs, generateSVGTextRenderer }
