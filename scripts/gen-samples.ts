/**
 * 生成演示样本图片（一次性脚本）：`npm run samples`
 *
 * 说明：图片内容与 bbox 同源（都来自 apps/server/src/bank/samples.ts），
 * 所以确认页的框选与图上文字永远对齐，不会出现「框错位」。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { SAMPLES, type PageBlock } from '../apps/server/src/bank/samples'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, '../apps/server/public/samples')
fs.mkdirSync(outDir, { recursive: true })

const FONT_HAND = 'KaiTi, STKaiti, serif'
const FONT_PRINT = 'SimSun, serif'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 把 2^{0.3} / log_{a} 这类写法转成 SVG tspan 上下标 */
function richText(line: string, size: number): string {
  let out = ''
  let buf = ''
  const flush = () => {
    if (buf) {
      out += esc(buf)
      buf = ''
    }
  }
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if ((ch === '^' || ch === '_') && i + 1 < line.length) {
      let content = ''
      let next = i + 1
      if (line[next] === '{') {
        const close = line.indexOf('}', next)
        if (close > 0) {
          content = line.slice(next + 1, close)
          next = close
        }
      } else {
        content = line[next]
      }
      if (content) {
        flush()
        const shift = ch === '^' ? 'super' : 'sub'
        out += `<tspan baseline-shift="${shift}" font-size="${(size * 0.66).toFixed(1)}">${esc(content)}</tspan>`
        i = next
        continue
      }
    }
    buf += ch
  }
  flush()
  return out
}

function blockSvg(b: PageBlock): string {
  const family = b.role === 'hand' || b.role === 'mark' ? FONT_HAND : FONT_PRINT
  const lh = Math.round(b.size * 1.5)
  const lines = b.lines
    .map(
      (line, i) =>
        `<text x="${b.x}" y="${b.y + i * lh}" font-family="${family}" font-size="${b.size}" fill="${b.color}">${richText(line, b.size)}</text>`,
    )
    .join('\n')

  if (!b.strike) return lines
  // 涂改：一条手写质感的删除线
  const w = Math.max(b.lines[0].length * b.size * 0.8, b.size * 3)
  return `${lines}
  <path d="M ${b.x - 6} ${b.y - b.size * 0.32} q ${w / 2} -8 ${w} 4" stroke="#8b93a5" stroke-width="4" fill="none" opacity="0.85"/>`
}

function pageSvg(sample: (typeof SAMPLES)[number]): string {
  const { width, height, blocks } = sample.page
  const rules = Array.from({ length: Math.floor(height / 64) }, (_, i) => {
    const y = 96 + i * 64
    return `<line x1="48" y1="${y}" x2="${width - 48}" y2="${y}" stroke="#e7e2d4" stroke-width="1"/>`
  }).join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="paper" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" result="noise"/>
      <feColorMatrix in="noise" type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer>
      <feComposite operator="over" in2="SourceGraphic"/>
    </filter>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#b9b3a0" stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#fbf9f1"/>
  <g opacity="0.75">${rules}</g>
  <g>${blocks.map(blockSvg).join('\n')}</g>
  <rect width="${width}" height="${height}" fill="url(#shade)" filter="url(#paper)" opacity="0.5"/>
</svg>`
}

for (const sample of SAMPLES) {
  const svg = pageSvg(sample)
  const target = path.join(outDir, sample.image_file)
  await sharp(Buffer.from(svg)).png({ quality: 92 }).toFile(target)
  const { size } = fs.statSync(target)
  console.log(`✓ ${sample.image_file}  ${(size / 1024).toFixed(0)} KB`)
}

console.log(`\n共生成 ${SAMPLES.length} 张样本图 → ${outDir}`)
