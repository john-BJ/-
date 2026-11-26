/** 文本/公式归一化与相似度：双通道互校、步骤对齐共用 */

const FULLWIDTH_MAP: Record<string, string> = {
  '，': ',',
  '。': '.',
  '：': ':',
  '；': ';',
  '（': '(',
  '）': ')',
  '＝': '=',
  '＋': '+',
  '－': '-',
  '×': '*',
  '·': '*',
  '÷': '/',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '−': '-',
  '—': '-',
}

export function normalize(s: string): string {
  let out = ''
  for (const ch of s) out += FULLWIDTH_MAP[ch] ?? ch
  return out
    .toLowerCase()
    .replace(/\\left|\\right/g, '')
    .replace(/\\dfrac/g, '\\frac')
    .replace(/\\,|\\;|\\!|\\ /g, '')
    .replace(/\s+/g, '')
    .replace(/[{}]/g, '')
}

export function normalizeLatex(s: string): string {
  return normalize(s)
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
}

export function bigrams(s: string): string[] {
  const n = normalize(s)
  const out: string[] = []
  for (let i = 0; i < n.length - 1; i++) out.push(n.slice(i, i + 2))
  if (out.length === 0 && n.length === 1) out.push(n)
  return out
}

/** 字符二元组 Jaccard，取值 0..1 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const A = bigrams(a)
  const B = bigrams(b)
  if (!A.length || !B.length) return normalize(a) === normalize(b) ? 1 : 0
  const setB = new Map<string, number>()
  for (const g of B) setB.set(g, (setB.get(g) ?? 0) + 1)
  let inter = 0
  for (const g of A) {
    const c = setB.get(g) ?? 0
    if (c > 0) {
      inter++
      setB.set(g, c - 1)
    }
  }
  return (2 * inter) / (A.length + B.length)
}

export function editDistance(a: string, b: string): number {
  const s = normalize(a)
  const t = normalize(b)
  const dp = new Array(t.length + 1).fill(0).map((_, j) => j)
  for (let i = 1; i <= s.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= t.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (s[i - 1] === t[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[t.length]
}

/**
 * LaTeX → 可比较的纯数学串。
 * 只做「表示层」归一（\frac → (a)/(b)、\lg → lg…），**不做任何代数化简**（§10.5）。
 */
export function canonMath(s: string): string {
  let t = s
  for (let i = 0; i < 3; i++) {
    const next = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    if (next === t) break
    t = next
  }
  t = t
    .replace(/\\times|\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\Rightarrow|\\rightarrow|\\to/g, '=>')
    .replace(/\\leqslant|\\leq|\\le(?![a-z])/g, '<=')
    .replace(/\\geqslant|\\geq|\\ge(?![a-z])/g, '>=')
    .replace(/\\neq|\\ne(?![a-z])/g, '!=')
    .replace(/\\lg/g, 'lg')
    .replace(/\\ln/g, 'ln')
    .replace(/\\log/g, 'log')
    .replace(/\\pi/g, 'pi')
    .replace(/\\mathbb\{R\}/g, 'R')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
  return normalize(t).replace(/[{}]/g, '')
}

/** 数学串相似度（先做表示层归一，再比字符二元组） */
export function simMath(a: string, b: string): number {
  return similarity(canonMath(a), canonMath(b))
}

/** 覆盖率：needle 的二元组有多大比例出现在 hay 中（用来判断"这一步在讲哪个知识点"） */
export function coverage(needle: string, hay: string): number {
  const A = bigrams(needle)
  if (!A.length) return 0
  const B = new Set(bigrams(hay))
  let hit = 0
  for (const g of A) if (B.has(g)) hit++
  return hit / A.length
}

/** bbox 重叠率：交集面积 / 较小面积 */export function overlapRatio(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const [ax, ay, aw, ah] = a
  const [bx, by, bw, bh] = b
  const x1 = Math.max(ax, bx)
  const y1 = Math.max(ay, by)
  const x2 = Math.min(ax + aw, bx + bw)
  const y2 = Math.min(ay + ah, by + bh)
  if (x2 <= x1 || y2 <= y1) return 0
  const inter = (x2 - x1) * (y2 - y1)
  const minArea = Math.min(aw * ah, bw * bh)
  return minArea <= 0 ? 0 : inter / minArea
}
