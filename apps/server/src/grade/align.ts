import type { ConfirmedStep, SolutionNode } from '../types'
import { canonMath, coverage, simMath, similarity } from '../lib/similarity'

export interface StepMatch {
  node_index: number
  step_index: number
  score: number
}

export interface Alignment {
  matches: StepMatch[]
  /** node_index → 匹配到的 step_index（无匹配为 null） */
  nodeToStep: (number | null)[]
  nodeScore: number[]
}

const PAIR_MIN = 0.34

/**
 * 步骤↔节点的"话题相似度"：只用于**对齐**（这一步在讲哪个知识点），
 * 不用于判定对错——把 `<` 写成 `>` 只差一个字符，文本相似度几乎不变，
 * 但数学上是错的。对错判定见 grade/service.ts 的判定层。
 */
function scoreOf(node: SolutionNode, step: ConfirmedStep): number {
  const stepText = step.text
  const stepLatex = step.latex ?? ''
  const stepAll = `${stepLatex} ${stepText}`

  const byFormula = simMath(node.formula, stepLatex || stepText)
  const byCover = coverage(canonMath(node.formula), canonMath(stepAll))
  const byGoal = similarity(node.goal, stepText) * 0.9
  return Math.max(byFormula, byCover * 0.98, byGoal)
}

/**
 * 单调对齐（保序 DP）：标准解的节点顺序不可打乱，学生步骤与节点做最大相似度匹配。
 * 只用于「定位首错步」，不用于判定对错以外的任何推断。
 */
export function alignSteps(nodes: SolutionNode[], steps: ConfirmedStep[]): Alignment {
  const n = nodes.length
  const m = steps.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  const S: number[][] = Array.from({ length: n }, () => new Array(m).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) S[i][j] = scoreOf(nodes[i], steps[j])
  }

  const choice: string[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(''))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const skipNode = dp[i - 1][j]
      const skipStep = dp[i][j - 1]
      const pair = S[i - 1][j - 1] >= PAIR_MIN ? dp[i - 1][j - 1] + S[i - 1][j - 1] : -Infinity
      const best = Math.max(skipNode, skipStep, pair)
      dp[i][j] = best
      choice[i][j] = best === pair ? 'pair' : best === skipNode ? 'node' : 'step'
    }
  }

  const matches: StepMatch[] = []
  const nodeToStep: (number | null)[] = new Array(n).fill(null)
  const nodeScore: number[] = new Array(n).fill(0)

  let i = n
  let j = m
  while (i > 0 && j > 0) {
    const c = choice[i][j]
    if (c === 'pair') {
      matches.push({ node_index: i - 1, step_index: j - 1, score: S[i - 1][j - 1] })
      nodeToStep[i - 1] = j - 1
      nodeScore[i - 1] = S[i - 1][j - 1]
      i--
      j--
    } else if (c === 'node') {
      i--
    } else {
      j--
    }
  }

  matches.sort((a, b) => a.node_index - b.node_index)
  return { matches, nodeToStep, nodeScore }
}
