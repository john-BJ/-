import type {
  ConfirmedSolution,
  ConfirmedStep,
  ErrorLabel,
  GradeResult,
  NodeJudgement,
  SecondaryError,
  SolutionNode,
} from '../types'
import type { CallTrace } from '../gateway'
import { alignSteps } from './align'

const PASS_SCORE = 0.62

export interface OracleLike {
  node_id: string
  step: number | null
  verdict: 'correct' | 'partial' | 'wrong' | 'missing'
}

export interface GradeInput {
  confirmed: ConfirmedSolution
  /** 批改任务自身的 task_id（§9.4 task_id 指的是批改任务，不是识别任务） */
  grade_task_id?: string
  nodes: SolutionNode[]
  answer: string
  method: string
  question_id: string | null
  source_type: 'bank' | 'model_solution'
  notice: string | null
  trace: CallTrace[]
  /** 演示样本的节点级判分标注；真实模式为 null */
  oracle?: OracleLike[] | null
  /** 识别阶段的原始步骤，用于判断学生是否改动过某一步 */
  origSteps?: { idx: number; text: string; latex: string | null }[]
}

interface Judgement {
  node: SolutionNode
  verdict: NodeJudgement['verdict']
  stepIdx: number | null
  evidence: string
  score: number
  byOracle: boolean
}

const VERDICT_TEXT: Record<string, string> = {
  correct: '正确',
  partial: '不完整',
  wrong: '有误',
  missing: '缺失',
  unjudged: '未判',
}

/**
 * 首次批改（§8.3）：答案 / 方法名 / 3-7 步骨架 / 首错步 / 错因主标签。
 *
 * 判定分两层：
 *  1) 对齐层：确定"学生第 k 步"对应"标准解第 n 节点"；
 *  2) 判定层：若演示样本带该节点的判分标注且学生未改动该步 → 采用标注；
 *     否则回退到文本比对，并把置信度降到 0.6 以下（不假装确定）。
 *
 * 铁律：
 * - 主标签七选一，取自首错步所在节点的 common_errors；
 * - 首错步之后的错误进 secondary_errors，单独标记，不计入主错点统计；
 * - 证据不足时降低 confidence 并在 basis 里写明依据。
 */
export function gradeConfirmed(input: GradeInput): GradeResult {
  const { confirmed, nodes, answer, method } = input
  const steps = confirmed.steps.filter((s) => s.included)
  const skeleton = nodes.slice(0, 7).map((n, i) => ({
    idx: i + 1,
    goal: n.goal,
    formula: n.formula,
    depends_on: n.depends_on,
  }))

  if (steps.length === 0) {
    return {
      task_id: input.grade_task_id ?? confirmed.task_id,
      node_judgement: nodes.map((n) => ({
        node_id: n.node_id,
        verdict: 'unjudged',
        evidence: '学生未保留任何步骤',
      })),
      overall: 'unjudged',
      error_localization: {
        first_error_step: null,
        step_text: '',
        step_latex: null,
        expected_action: '',
        expected_formula: '',
        student_action: '',
        primary_label: null,
        confidence: 0,
        basis: '确认后的解答为空，无法定位错误，需学生补录步骤后重新批改',
        followup_seeds: [],
      },
      secondary_errors: [],
      answer_latex: answer,
      method,
      skeleton,
      full_derivation_locked: true,
      provenance: { question_id: input.question_id, source_type: input.source_type, notice: input.notice },
      meta: { model_trace: input.trace, low_confidence: true },
    }
  }

  const origByIdx = new Map((input.origSteps ?? []).map((s) => [s.idx, s]))
  const oracleByNode = new Map((input.oracle ?? []).map((o) => [o.node_id, o]))
  const al = alignSteps(nodes, steps)

  /** 学生是否改过这一步（改过就不再用标注，避免"改了答案结论不变"） */
  const isUnchanged = (idx: number | null): boolean => {
    if (idx == null) return true
    const orig = origByIdx.get(idx)
    const cur = steps.find((s) => s.idx === idx)
    if (!orig || !cur) return false
    return orig.text === cur.text && (orig.latex ?? '') === (cur.latex ?? '')
  }

  const judgements: Judgement[] = nodes.map((node, i) => {
    const oracle = oracleByNode.get(node.node_id)
    if (oracle && isUnchanged(oracle.step)) {
      const exists = oracle.step == null ? null : steps.find((s) => s.idx === oracle.step) ?? null
      const verdict = oracle.step != null && !exists ? 'missing' : oracle.verdict
      return {
        node,
        verdict,
        stepIdx: exists ? exists.idx : null,
        evidence: `演示样本节点标注：${VERDICT_TEXT[verdict]}（该步骤未被改动）`,
        score: verdict === 'correct' ? 0.95 : 0.35,
        byOracle: true,
      }
    }

    const si = al.nodeToStep[i]
    if (si == null) {
      return {
        node,
        verdict: 'missing',
        stepIdx: null,
        evidence: `未找到与「${node.goal}」对应的步骤；标准写法为 ${node.formula}`,
        score: 0,
        byOracle: false,
      }
    }
    const s = steps[si]
    const score = al.nodeScore[i]
    return {
      node,
      verdict: score >= PASS_SCORE ? 'correct' : 'partial',
      stepIdx: s.idx,
      evidence: `与第 ${s.idx} 步相似度 ${(score * 100).toFixed(0)}%；标准写法 ${node.formula}，学生写法 ${
        s.latex ?? s.text
      }`,
      score,
      byOracle: false,
    }
  })

  const node_judgement: NodeJudgement[] = judgements.map((j) => ({
    node_id: j.node.node_id,
    verdict: j.verdict,
    evidence: j.evidence,
  }))

  const firstBad = judgements.findIndex((j) => j.verdict !== 'correct')
  const allCorrect = firstBad === -1
  const allByOracle = judgements.every((j) => j.byOracle)

  let confidence = allByOracle
    ? 0.88
    : judgements.reduce((a, j) => a + (j.score > 0 ? j.score : 0.3), 0) / judgements.length
  if (firstBad >= 0 && !allByOracle) confidence = Math.min(confidence, 0.72)
  if (!allByOracle && steps.length < nodes.length) confidence = Math.min(confidence, 0.6)
  confidence = Math.max(0.25, Math.min(0.95, Number(confidence.toFixed(2))))

  let error_localization: GradeResult['error_localization']
  const secondary_errors: SecondaryError[] = []

  if (allCorrect) {
    error_localization = {
      first_error_step: null,
      step_text: '',
      step_latex: null,
      expected_action: '',
      expected_formula: '',
      student_action: '',
      primary_label: null,
      confidence,
      basis: `全部 ${nodes.length} 个标准解节点均找到对应写法，未发现偏离（${allByOracle ? '演示样本节点标注' : '逐节点文本比对'}）`,
      followup_seeds: [
        `为什么这道题要用「${method}」？换一种方法会更快吗？`,
        `如果题目条件改一个数字，「${nodes[0]?.goal ?? '第一步'}」还成立吗？`,
      ],
    }
  } else {
    const bad = judgements[firstBad]
    const badNode = bad.node

    let atStep = bad.stepIdx
    if (atStep == null) {
      const prev = judgements
        .slice(0, firstBad)
        .reverse()
        .find((j) => j.stepIdx != null)
      atStep = prev?.stepIdx != null ? prev.stepIdx + 1 : steps[0]?.idx ?? 1
    }

    const studentStep = steps.find((s) => s.idx === atStep) ?? null
    const label = (badNode.common_errors[0] ?? '跳步') as ErrorLabel

    error_localization = {
      first_error_step: atStep,
      step_text: studentStep ? studentStep.text : '（该步骤缺失）',
      step_latex: studentStep?.latex ?? null,
      expected_action: badNode.goal,
      expected_formula: badNode.formula,
      student_action: studentStep ? studentStep.text : '未书写该步骤',
      primary_label: label,
      confidence,
      basis:
        bad.byOracle
          ? `节点「${badNode.goal}」在演示样本中被标注为「${VERDICT_TEXT[bad.verdict]}」，依据为逐节点比对`
          : bad.stepIdx == null
            ? `节点「${badNode.goal}」在学生的 ${steps.length} 个步骤中没有对应写法`
            : `第 ${bad.stepIdx} 步与节点「${badNode.goal}」的写法相似度 ${(bad.score * 100).toFixed(
                0,
              )}%，低于通过阈值 ${(PASS_SCORE * 100).toFixed(0)}%`,
      followup_seeds: [
        `「${badNode.goal}」这一步为什么必须做？不做会怎样？`,
        `你这一步与标准写法的差别在哪？`,
      ],
    }

    judgements.forEach((j, i) => {
      if (i > firstBad && j.verdict !== 'correct') {
        secondary_errors.push({ step: j.stepIdx ?? i + 1, label: (j.node.common_errors[0] ?? '跳步') as ErrorLabel })
      }
    })
  }

  const overall: GradeResult['overall'] = allCorrect
    ? 'correct'
    : judgements[0].verdict !== 'correct'
      ? 'wrong'
      : 'partial'

  return {
    task_id: input.grade_task_id ?? confirmed.task_id,
    node_judgement,
    overall,
    error_localization,
    secondary_errors,
    answer_latex: answer,
    method,
    skeleton,
    full_derivation_locked: true,
    provenance: { question_id: input.question_id, source_type: input.source_type, notice: input.notice },
    meta: { model_trace: input.trace, low_confidence: confidence < 0.6 },
  }
}
