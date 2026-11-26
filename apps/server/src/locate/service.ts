import { QUESTIONS } from '../bank/questions'
import { SAMPLE_MAP } from '../bank/samples'
import { call, type CallTrace } from '../gateway'
import { similarity } from '../lib/similarity'
import type { LocateResult, RecognizeResult, StandardSolution } from '../types'

const HIT_THRESHOLD = 0.62

/**
 * 题目定位（§5 / §9.3）
 *
 * 1. 优先查自建题库：用识别到的题干做区域指纹比对；
 * 2. 未命中时走 reason 模型自解兜底，并强制标注「未检索到原题」；
 * 3. 双路检索互校本轮只留接口桩（enabled:false），不伪装成已实现。
 */
export async function locateQuestion(
  recognize: RecognizeResult,
  sampleId: string | null,
  trace: CallTrace[],
): Promise<LocateResult> {
  const stemText = recognize.channel_ocr.stem.map((b) => b.text).join('')
  const ranked = QUESTIONS.map((q) => ({
    q,
    score: Number(similarity(stemText, q.stem_plain).toFixed(3)),
  })).sort((a, b) => b.score - a.score)

  const top = ranked[0]
  const forcedMiss = sampleId ? SAMPLE_MAP.get(sampleId)?.locate_miss : undefined
  const hit = !forcedMiss && top.score >= HIT_THRESHOLD

  const dual_retrieval = {
    enabled: false,
    reason: '本轮仅保留接口桩：双路检索互校（题库指纹 + 向量召回）计划在下一迭代联调',
    candidates: ranked.slice(0, 3).map((r) => ({
      source: 'self_built_bank',
      question_id: r.q.question_id,
      score: r.score,
    })),
  }

  if (hit) {
    return {
      hit: true,
      question_id: top.q.question_id,
      stem: top.q.stem,
      knowledge_points: top.q.knowledge_points,
      standard_solution: top.q.standard_solution,
      source: {
        type: 'bank',
        url: null,
        license_note: top.q.source.license_note,
      },
      meta: {
        notice: null,
        matched_by: 'fingerprint',
        score: top.score,
        derivation: top.q.full_derivation,
        dual_retrieval,
      },
    }
  }

  // 未命中 → 模型独立解答兜底
  const reason = await call<{ solution: StandardSolution; derivation: { text: string; latex: string | null }[] }>(
    'reason',
    { sampleId, stemText },
    trace,
  )

  const notice = forcedMiss
    ? `未检索到原题，以下为模型独立解答（${forcedMiss.notice}）`
    : '未检索到原题，以下为模型独立解答'

  return {
    hit: false,
    question_id: null,
    stem: stemText || null,
    knowledge_points: [],
    standard_solution: {
      method: reason.solution.method,
      nodes: reason.solution.nodes,
      answer: reason.solution.answer,
    },
    source: {
      type: 'model_solution',
      url: null,
      license_note: '模型生成内容，仅作参考，未与题库原题互校',
    },
    meta: { notice, matched_by: 'none', score: top.score, derivation: reason.derivation, dual_retrieval },
  }
}
