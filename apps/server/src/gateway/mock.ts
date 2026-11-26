import { SAMPLE_MAP, blockBBox, blockOf, type Sample } from '../bank/samples'
import { QUESTION_MAP } from '../bank/questions'
import type {
  OcrBlock,
  OcrFormula,
  RemovedMark,
  SolutionNode,
  StandardSolution,
  VisionStep,
} from '../types'

/**
 * Mock Provider：用作者标注的 8 条样本模拟两个通道的**独立输出**。
 * 关键设计：OCR 通道与 Vision 通道各自返回自己的读数，diff 由 merge 层真实计算，
 * 而不是把「冲突结论」直接写死——这样确认页的互校逻辑与真实模式完全同构。
 */

export interface OcrOutput {
  stem: OcrBlock[]
  formulas: OcrFormula[]
  layout: { regions: { kind: string; bbox: [number, number, number, number] }[] }
}

export interface VisionOutput {
  steps: VisionStep[]
  removed_marks: RemovedMark[]
}

export function mockOcr(sample: Sample): OcrOutput {
  const stemBlock = blockOf(sample, 'stem')!
  const stemBBox = blockBBox(stemBlock)
  const stem: OcrBlock[] = [
    {
      id: 'b1',
      type: 'stem',
      text: stemBlock.lines.join(''),
      bbox: stemBBox,
      conf: 0.96,
    },
  ]

  const overrides = new Map(sample.ocr_overrides.map((o) => [o.step, o.latex]))
  const formulas: OcrFormula[] = []
  sample.steps.forEach((s, i) => {
    const idx = i + 1
    const block = blockOf(sample, s.block_id)
    if (!block) return
    const bbox = blockBBox(block)
    const override = overrides.get(idx)
    if (override) {
      override.forEach((latex, k) => {
        formulas.push({ id: `f${idx}_${k}`, latex, bbox, conf: 0.68 })
      })
      return
    }
    if (s.latex) {
      formulas.push({ id: `f${idx}_0`, latex: s.latex, bbox, conf: 0.92 })
    }
  })

  return {
    stem,
    formulas,
    layout: {
      regions: [
        { kind: 'stem', bbox: stemBBox },
        ...sample.steps.map((s) => {
          const b = blockOf(sample, s.block_id)!
          return { kind: 'handwriting', bbox: blockBBox(b) }
        }),
      ],
    },
  }
}

export function mockVision(sample: Sample): VisionOutput {
  const steps: VisionStep[] = sample.steps.map((s, i) => {
    const block = blockOf(sample, s.block_id)
    return {
      idx: i + 1,
      text: s.text,
      latex: s.latex,
      bbox: block ? blockBBox(block) : null,
      readable: s.status !== 'unreadable',
      conf: s.conf,
      status: s.status,
    }
  })

  const removed_marks: RemovedMark[] = sample.removed.map((r, i) => {
    const block = blockOf(sample, r.block_id)
    return {
      idx: i + 1,
      reason: r.reason,
      text: r.text,
      bbox: block ? blockBBox(block) : null,
    }
  })

  return { steps, removed_marks }
}

/** 题库未命中时，reason 模型的独立解答（mock 用自建题库里的同题解，标注来源为 model_solution） */
const FALLBACK_MAP: Record<string, string> = {
  s8: 'M-LOG-004',
}

export function mockReasonSolution(sampleId: string): {
  solution: StandardSolution
  derivation: { text: string; latex: string | null }[]
  nodes: SolutionNode[]
} {
  const qid = FALLBACK_MAP[sampleId]
  const q = qid ? QUESTION_MAP.get(qid) : undefined
  if (!q) {
    // 没有对应题目的样本（理论上不会发生）：明确抛错而不是编造一份解
    throw new Error('MOCK_NO_REASON_SAMPLE')
  }
  return {
    solution: { ...q.standard_solution },
    derivation: q.full_derivation,
    nodes: q.standard_solution.nodes,
  }
}

export function sampleOf(id: string | null | undefined): Sample | null {
  if (!id) return null
  return SAMPLE_MAP.get(id) ?? null
}
