import type { DiffItem, OcrFormula, VisionStep } from '../types'
import { editDistance, normalizeLatex, overlapRatio } from '../lib/similarity'

/**
 * 双通道互校：几何配对 + 文本/公式比对，产出三级 diff（字符 / 公式 / 切片）。
 *
 * 注意：这里只做「比对与标注」，不做「自动采纳」。任何冲突都会进入人工确认环节，
 * 不存在「置信度高就自动通过」的分支（§10.2）。
 */
export function buildDiff(formulas: OcrFormula[], steps: VisionStep[]): DiffItem[] {
  const out: DiffItem[] = []
  const used = new Set<string>()

  for (const step of steps) {
    if (!step.bbox) {
      out.push({
        level: 'slice',
        step: step.idx,
        ocr: null,
        vision: step.latex ?? step.text,
        status: 'vision_only',
      })
      continue
    }
    const related = formulas.filter((f) => overlapRatio(f.bbox, step.bbox!) >= 0.45)
    related.forEach((f) => used.add(f.id))

    if (related.length === 0) {
      out.push({
        level: 'slice',
        step: step.idx,
        ocr: null,
        vision: step.latex ?? step.text,
        status: 'vision_only',
      })
      continue
    }

    if (related.length > 1) {
      // 同一位置切出多个公式 → 切片粒度不一致，必须由学生决定如何拆并
      out.push({
        level: 'slice',
        step: step.idx,
        ocr: related.map((f) => f.latex).join(' ｜ '),
        vision: step.latex ?? step.text,
        status: 'conflict',
      })
      continue
    }

    const ocrLatex = related[0].latex
    const visionLatex = step.latex ?? step.text
    const same = normalizeLatex(ocrLatex) === normalizeLatex(visionLatex)
    if (same) {
      out.push({ level: 'char', step: step.idx, ocr: ocrLatex, vision: visionLatex, status: 'verified' })
    } else {
      const dist = editDistance(normalizeLatex(ocrLatex), normalizeLatex(visionLatex))
      out.push({
        level: dist <= 2 ? 'char' : 'formula',
        step: step.idx,
        ocr: ocrLatex,
        vision: visionLatex,
        status: 'conflict',
      })
    }
  }

  for (const f of formulas) {
    if (used.has(f.id)) continue
    out.push({ level: 'slice', step: 0, ocr: f.latex, vision: null, status: 'ocr_only' })
  }

  return out
}

/** 依据 diff 回写每一步的通道状态（供确认页 badge 使用） */
export function applyDiffToSteps(steps: VisionStep[], diff: DiffItem[]): VisionStep[] {
  return steps.map((s) => {
    const d = diff.find((x) => x.step === s.idx)
    if (d?.status === 'conflict') return { ...s, status: 'conflict' as const }
    if (!s.readable) return { ...s, status: 'unreadable' as const }
    return { ...s, status: 'verified' as const }
  })
}

export function avgConf(nums: number[]): number {
  if (!nums.length) return 0
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3))
}
