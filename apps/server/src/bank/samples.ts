import type { BBox } from '../types'

/** 试卷页面块：渲染（生成 PNG）与 bbox 计算共用同一份数据，保证框选不偏移 */
export interface PageBlock {
  id: string
  role: 'header' | 'stem' | 'hand' | 'mark'
  lines: string[]
  x: number
  y: number
  size: number
  color: string
  /** 涂改块（画删除线，识别时进 removed_marks） */
  strike?: boolean
}

export interface SampleStep {
  block_id: string
  text: string
  latex: string | null
  conf: number
  status: 'verified' | 'conflict' | 'unreadable'
}

export interface Sample {
  sample_id: string
  title: string
  tag: string
  question_id: string | null
  image_file: string
  page: { width: number; height: number; blocks: PageBlock[] }
  steps: SampleStep[]
  removed: { block_id: string; text: string; reason: 'crossed_out' | 'draft' | 'margin' }[]
  /**
   * mock OCR 通道的公式读数。真实模式由模型返回；
   * 这里显式给出"同一位置两个通道读出不同结果"的样本，用于复现冲突态。
   */
  ocr_overrides: { step: number; latex: string[] }[]
  locate_miss?: { notice: string }
  warnings?: string[]
}

const PRINT = '#1c1c1c'
const HAND = '#16233f'
const GREY = '#8a8577'

/** 估算文本宽度：中文按字宽，西文按 0.55 字宽 */
export function estWidth(text: string, size: number): number {
  let w = 0
  for (const ch of text) {
    w += /[\u4e00-\u9fa5]/.test(ch) ? size : size * 0.56
  }
  return w
}

export function blockBBox(b: PageBlock): BBox {
  const lh = Math.round(b.size * 1.5)
  const w = Math.max(...b.lines.map((l) => estWidth(l, b.size)), b.size * 2)
  return [
    Math.round(b.x - 12),
    Math.round(b.y - b.size * 1.15),
    Math.round(w + 26),
    Math.round(lh * (b.lines.length - 1) + b.size * 1.6),
  ]
}

const W = 1000
const H = 920

function header(text: string): PageBlock {
  return { id: 'hd', role: 'header', lines: [text], x: 720, y: 60, size: 20, color: GREY }
}

function stem(lines: string[]): PageBlock {
  return { id: 'stem', role: 'stem', lines, x: 64, y: 160, size: 30, color: PRINT }
}

function hand(id: string, lines: string[], row: number): PageBlock {
  return { id, role: 'hand', lines, x: 84, y: 300 + row * 116, size: 36, color: HAND }
}

function mark(id: string, text: string, row: number): PageBlock {
  return { id, role: 'mark', lines: [text], x: 92, y: 300 + row * 116, size: 34, color: '#7b8aa3', strike: true }
}

export const SAMPLES: Sample[] = [
  {
    sample_id: 's1',
    title: '指数函数比大小 · 公式抄错（双通道冲突）',
    tag: '冲突 · 概念误用',
    question_id: 'M-EXP-001',
    image_file: 's1-exp-compare.png',
    page: {
      width: W,
      height: H,
      blocks: [
        header('数学 · 错题订正 01'),
        stem(['已知 a=2^{0.3}，b=2^{0.5}，c=0.5^{0.3}，', '则 a、b、c 的大小关系是（  ）']),
        hand('h1', ['因为 0.3<0.5，所以 2^{0.3}>2^{0.5}，即 a>b'], 0),
        hand('h2', ['又 0.5^{0.3}<1，所以 c<1'], 1),
        hand('h3', ['故 a>b>c，选 A'], 2),
      ],
    },
    steps: [
      {
        block_id: 'h1',
        text: '因为 0.3<0.5，所以 2^{0.3}>2^{0.5}，即 a>b',
        latex: String.raw`0.3<0.5\Rightarrow 2^{0.3}>2^{0.5}`,
        conf: 0.71,
        status: 'conflict',
      },
      {
        block_id: 'h2',
        text: '又 0.5^{0.3}<1，所以 c<1',
        latex: String.raw`0.5^{0.3}<1\Rightarrow c<1`,
        conf: 0.88,
        status: 'verified',
      },
      {
        block_id: 'h3',
        text: '故 a>b>c，选 A',
        latex: String.raw`a>b>c`,
        conf: 0.9,
        status: 'verified',
      },
    ],
    removed: [],
    ocr_overrides: [{ step: 1, latex: ['2^{0.3}>2^{0.8}'] }],
  },
  {
    sample_id: 's2',
    title: '指数方程换元 · 涂改后漏解',
    tag: '涂改 · 低置信 · 跳步',
    question_id: 'M-EXP-002',
    image_file: 's2-exp-equation.png',
    page: {
      width: W,
      height: H,
      blocks: [
        header('数学 · 错题订正 02'),
        stem(['解方程 4^{x}-5·2^{x}+4=0。']),
        hand('h1', ['令 t=2^{x}（t>0），则 t^{2}-5t+4=0'], 0),
        mark('h2', 't=4', 1),
        hand('h3', ['(t-1)(t-4)=0，得 t=1'], 2),
        hand('h4', ['所以 2^{x}=1，x=0'], 3),
      ],
    },
    steps: [
      {
        block_id: 'h1',
        text: '令 t=2^{x}（t>0），则 t^{2}-5t+4=0',
        latex: String.raw`t=2^{x}>0,\ t^{2}-5t+4=0`,
        conf: 0.86,
        status: 'verified',
      },
      {
        block_id: 'h3',
        text: '(t-1)(t-4)=0，得 t=1',
        latex: String.raw`(t-1)(t-4)=0\Rightarrow t=1`,
        conf: 0.44,
        status: 'unreadable',
      },
      {
        block_id: 'h4',
        text: '所以 2^{x}=1，x=0',
        latex: String.raw`2^{x}=1\Rightarrow x=0`,
        conf: 0.79,
        status: 'verified',
      },
    ],
    removed: [{ block_id: 'h2', text: 't=4', reason: 'crossed_out' }],
    ocr_overrides: [{ step: 2, latex: ['(t-1)(t-4)=0', 't=1'] }],
    warnings: ['第 2 步手写笔画粘连，置信度低于阈值，需人工确认'],
  },
  {
    sample_id: 's3',
    title: '指数函数定点 · 平移方向记反',
    tag: '概念误用',
    question_id: 'M-EXP-003',
    image_file: 's3-exp-anchor.png',
    page: {
      width: W,
      height: H,
      blocks: [
        header('数学 · 错题订正 03'),
        stem(['函数 y=a^{x-1}+2（a>0，a≠1）', '的图象恒过定点 ______。']),
        hand('h1', ['令 x=0，得 y=a^{-1}+2'], 0),
        hand('h2', ['所以定点为 (0,3)'], 1),
      ],
    },
    steps: [
      {
        block_id: 'h1',
        text: '令 x=0，得 y=a^{-1}+2',
        latex: String.raw`x=0\Rightarrow y=a^{-1}+2`,
        conf: 0.91,
        status: 'verified',
      },
      { block_id: 'h2', text: '所以定点为 (0,3)', latex: String.raw`(0,3)`, conf: 0.93, status: 'verified' },
    ],
    removed: [],
    ocr_overrides: [],
  },
  {
    sample_id: 's4',
    title: '指数型复合函数值域 · 漏掉 y>0',
    tag: '切片冲突 · 条件遗漏',
    question_id: 'M-EXP-004',
    image_file: 's4-exp-range.png',
    page: {
      width: W,
      height: H,
      blocks: [
        header('数学 · 错题订正 04'),
        stem(['求函数 y=(1/2)^{x^{2}-2x} 的值域。']),
        hand('h1', ['设 t=x^{2}-2x=(x-1)^{2}-1，t≥-1'], 0),
        hand('h2', ['y=(1/2)^{t} 递减，所以 y≤2'], 1),
        hand('h3', ['值域为 (-∞,2]'], 2),
      ],
    },
    steps: [
      {
        block_id: 'h1',
        text: '设 t=x^{2}-2x=(x-1)^{2}-1，t≥-1',
        latex: String.raw`t=(x-1)^{2}-1\ge -1`,
        conf: 0.87,
        status: 'verified',
      },
      {
        block_id: 'h2',
        text: 'y=(1/2)^{t} 递减，所以 y≤2',
        latex: String.raw`y\le 2`,
        conf: 0.83,
        status: 'conflict',
      },
      { block_id: 'h3', text: '值域为 (-∞,2]', latex: String.raw`(-\infty,2]`, conf: 0.9, status: 'verified' },
    ],
    removed: [],
    ocr_overrides: [{ step: 2, latex: ['y\\le 2', 'y=(1/2)^{t}'] }],
  },
  {
    sample_id: 's5',
    title: '对数运算求值 · 全对样本',
    tag: '全对',
    question_id: 'M-LOG-001',
    image_file: 's5-log-eval.png',
    page: {
      width: W,
      height: H,
      blocks: [
        header('数学 · 错题订正 05'),
        stem(['计算 lg25+lg4+2^{log₂3}。']),
        hand('h1', ['lg25+lg4=lg100=2'], 0),
        hand('h2', ['2^{log₂3}=3'], 1),
        hand('h3', ['原式=2+3=5'], 2),
      ],
    },
    steps: [
      { block_id: 'h1', text: 'lg25+lg4=lg100=2', latex: String.raw`\lg 25+\lg 4=2`, conf: 0.94, status: 'verified' },
      { block_id: 'h2', text: '2^{log₂3}=3', latex: String.raw`2^{\log_{2}3}=3`, conf: 0.92, status: 'verified' },
      { block_id: 'h3', text: '原式=2+3=5', latex: '5', conf: 0.95, status: 'verified' },
    ],
    removed: [],
    ocr_overrides: [],
  },
  {
    sample_id: 's6',
    title: '对数定义域 · 解集取错区间',
    tag: '符号错误',
    question_id: 'M-LOG-002',
    image_file: 's6-log-domain.png',
    page: {
      width: W,
      height: H,
      blocks: [
        header('数学 · 错题订正 06'),
        stem(['函数 f(x)=log_{0.5}(x^{2}-3x+2)', '的定义域为 ______。']),
        hand('h1', ['真数大于 0：x^{2}-3x+2>0'], 0),
        hand('h2', ['(x-1)(x-2)>0'], 1),
        hand('h3', ['所以 1<x<2'], 2),
      ],
    },
    steps: [
      {
        block_id: 'h1',
        text: '真数大于 0：x^{2}-3x+2>0',
        latex: String.raw`x^{2}-3x+2>0`,
        conf: 0.9,
        status: 'verified',
      },
      { block_id: 'h2', text: '(x-1)(x-2)>0', latex: String.raw`(x-1)(x-2)>0`, conf: 0.92, status: 'verified' },
      { block_id: 'h3', text: '所以 1<x<2', latex: String.raw`1<x<2`, conf: 0.86, status: 'verified' },
    ],
    removed: [],
    ocr_overrides: [],
  },
  {
    sample_id: 's7',
    title: '对数式表示 · 系数与指数混淆',
    tag: '字符冲突 · 低置信 · 公式误用',
    question_id: 'M-LOG-003',
    image_file: 's7-log-express.png',
    page: {
      width: W,
      height: H,
      blocks: [
        header('数学 · 错题订正 07'),
        stem(['已知 log_a2=m，log_a3=n，', '则 log_a12= ______（用 m、n 表示）。']),
        hand('h1', ['12=2^{2}×3'], 0),
        hand('h2', ['log_a12=2log_a2+log_a3'], 1),
        hand('h3', ['=m^{2}+n'], 2),
      ],
    },
    steps: [
      { block_id: 'h1', text: '12=2^{2}×3', latex: String.raw`12=2^{2}\times 3`, conf: 0.93, status: 'verified' },
      {
        block_id: 'h2',
        text: 'log_a12=2log_a2+log_a3',
        latex: String.raw`\log_{a}12=2\log_{a}2+\log_{a}3`,
        conf: 0.85,
        status: 'verified',
      },
      { block_id: 'h3', text: '=m^{2}+n', latex: String.raw`m^{2}+n`, conf: 0.51, status: 'conflict' },
    ],
    removed: [],
    ocr_overrides: [{ step: 3, latex: ['2m+n'] }],
    warnings: ['第 3 步上标位置歧义：2m 与 m² 两种读法均可能，需学生裁定'],
  },
  {
    sample_id: 's8',
    title: '对数比大小 · 扫描残缺（题库未命中）',
    tag: '未检索到 · 审题偏差',
    question_id: null,
    image_file: 's8-log-compare.png',
    page: {
      width: W,
      height: H,
      blocks: [
        header('数学 · 错题订正 08'),
        stem(['设 a=log₂3，b=log₃2，c=log_{0.5}3，', '则 a、b、c 的大小关系是（  ）']),
        hand('h1', ['a=log₂3>1，b=log₃2<1'], 0),
        hand('h2', ['c=log_{0.5}3>0'], 1),
        hand('h3', ['所以 b>a>c'], 2),
      ],
    },
    steps: [
      {
        block_id: 'h1',
        text: 'a=log₂3>1，b=log₃2<1',
        latex: String.raw`a>1,\ b<1`,
        conf: 0.88,
        status: 'verified',
      },
      {
        block_id: 'h2',
        text: 'c=log_{0.5}3>0',
        latex: String.raw`c>0`,
        conf: 0.74,
        status: 'verified',
      },
      { block_id: 'h3', text: '所以 b>a>c', latex: String.raw`b>a>c`, conf: 0.81, status: 'verified' },
    ],
    removed: [],
    ocr_overrides: [],
    locate_miss: {
      notice: '题干右上方被折角遮挡，区域指纹残缺，题库未命中',
    },
  },
]

export const SAMPLE_MAP = new Map(SAMPLES.map((s) => [s.sample_id, s]))

export function blockOf(sample: Sample, id: string): PageBlock | undefined {
  return sample.page.blocks.find((b) => b.id === id)
}

/* ------------------------------------------------------------------------- */
/* 演示样本的「节点级判分标注」（仅在 mock 模式使用）                          */
/*                                                                           */
/* 为什么需要它：数学对错无法靠文本相似度判定——把 `<` 写成 `>` 只差一个字符，  */
/* 文本相似度几乎不变，但结论是错的。真实模式由判分模型负责；演示模式用作者     */
/* 标注作为 oracle。一旦学生改动了某一步，该节点立即回退到文本比对并标低置信，  */
/* 所以「确认结果变化 → 批改结论变化」这条链路依然成立。                       */
/* ------------------------------------------------------------------------- */

export type OracleVerdict = 'correct' | 'partial' | 'wrong' | 'missing'

export interface OracleEntry {
  node_id: string
  /** 对应 sample.steps 的 1-based 序号；null 表示学生缺失该节点 */
  step: number | null
  verdict: OracleVerdict
}

export const SAMPLE_ORACLE: Record<string, OracleEntry[]> = {
  s1: [
    { node_id: 'n1', step: 1, verdict: 'wrong' },
    { node_id: 'n2', step: 2, verdict: 'correct' },
    { node_id: 'n3', step: 3, verdict: 'correct' },
  ],
  s2: [
    { node_id: 'n1', step: 1, verdict: 'correct' },
    { node_id: 'n2', step: 1, verdict: 'correct' },
    { node_id: 'n3', step: 2, verdict: 'partial' },
    { node_id: 'n4', step: null, verdict: 'missing' },
  ],
  s3: [
    { node_id: 'n1', step: 1, verdict: 'wrong' },
    { node_id: 'n2', step: 1, verdict: 'wrong' },
    { node_id: 'n3', step: 2, verdict: 'wrong' },
  ],
  s4: [
    { node_id: 'n1', step: 1, verdict: 'correct' },
    { node_id: 'n2', step: 2, verdict: 'correct' },
    { node_id: 'n3', step: 2, verdict: 'correct' },
    { node_id: 'n4', step: 3, verdict: 'wrong' },
  ],
  s5: [
    { node_id: 'n1', step: 1, verdict: 'correct' },
    { node_id: 'n2', step: 2, verdict: 'correct' },
    { node_id: 'n3', step: 3, verdict: 'correct' },
  ],
  s6: [
    { node_id: 'n1', step: 1, verdict: 'correct' },
    { node_id: 'n2', step: 2, verdict: 'correct' },
    { node_id: 'n3', step: 3, verdict: 'wrong' },
  ],
  s7: [
    { node_id: 'n1', step: 1, verdict: 'correct' },
    { node_id: 'n2', step: 2, verdict: 'correct' },
    { node_id: 'n3', step: 3, verdict: 'wrong' },
  ],
  s8: [
    { node_id: 'n1', step: 1, verdict: 'correct' },
    { node_id: 'n2', step: 2, verdict: 'correct' },
    { node_id: 'n3', step: 2, verdict: 'wrong' },
    { node_id: 'n4', step: 3, verdict: 'wrong' },
  ],
}
