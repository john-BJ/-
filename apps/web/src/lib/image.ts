/** 客户端图片预处理：EXIF 方向校正 → 长边降采样 → JPEG 重编码 → 感知哈希 / 清晰度自检 */

const LONG_EDGE = 1800
const HASH_SIZE = 8

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  url: string
  phash: string
  sharpness: number
  originalBytes: number
  name: string
}

type Drawable = ImageBitmap | HTMLImageElement

async function loadDrawable(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation: from-image 让浏览器按 EXIF 方向解码（替代手写 EXIF 解析）
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    } catch {
      /* Safari 老版本不支持该参数，走 <img> 兜底 */
    }
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

function sizeOf(d: Drawable): { w: number; h: number } {
  if (d instanceof HTMLImageElement) return { w: d.naturalWidth, h: d.naturalHeight }
  return { w: d.width, h: d.height }
}

function drawTo(d: Drawable, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(d, 0, 0, w, h)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), 'image/jpeg', quality)
  })
}

/** 8×8 均值哈希 → 16 位十六进制（64bit） */
function computePhash(d: Drawable): string {
  const canvas = drawTo(d, HASH_SIZE, HASH_SIZE)
  const data = canvas.getContext('2d')!.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data
  const grays: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    grays.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }
  const avg = grays.reduce((a, b) => a + b, 0) / grays.length
  let bits = ''
  for (const g of grays) bits += g > avg ? '1' : '0'
  let hex = ''
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

/** 拉普拉斯方差：值越低越糊（阈值仅作提示，不阻塞流程） */
function computeSharpness(d: Drawable): number {
  const { w, h } = sizeOf(d)
  const scale = Math.min(1, 240 / Math.max(w, h))
  const cw = Math.max(8, Math.round(w * scale))
  const ch = Math.max(8, Math.round(h * scale))
  const canvas = drawTo(d, cw, ch)
  const data = canvas.getContext('2d')!.getImageData(0, 0, cw, ch).data
  const gray = new Float32Array(cw * ch)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  const vals: number[] = []
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x
      vals.push(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - cw] - gray[i + cw])
    }
  }
  if (!vals.length) return 0
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const drawable = await loadDrawable(file)
  const { w, h } = sizeOf(drawable)
  if (!w || !h) throw new Error('无法读取图片尺寸')

  const scale = Math.min(1, LONG_EDGE / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))

  const canvas = drawTo(drawable, tw, th)
  const blob = await toBlob(canvas)

  return {
    blob,
    width: tw,
    height: th,
    url: URL.createObjectURL(blob),
    phash: computePhash(drawable),
    sharpness: Math.round(computeSharpness(drawable)),
    originalBytes: file.size,
    name: file.name || 'capture.jpg',
  }
}

export const SHARPNESS_HINT = 40

export function describeBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
