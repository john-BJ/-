/**
 * 前后端共享的数据契约。
 *
 * 口径来源：技术说明 §9（JSON 契约）——「可加字段，不可删字段或改语义」。
 * 因此本文件所有 §9 定义字段保持原始 snake_case 命名与语义；
 * 本 MVP 新增的字段统一收敛在 `meta` / `ext` 命名空间下，不污染标准字段。
 */

/* ---------------------------------- 通用 ---------------------------------- */

export type ErrorLabel =
  | '概念误用'
  | '条件遗漏'
  | '公式误用'
  | '符号错误'
  | '跳步'
  | '计算失误'
  | '审题偏差'

/** §10.1 错因主标签固定七选一，代码层用常量约束，避免自由文本流入统计 */
export const ERROR_LABELS: ErrorLabel[] = [
  '概念误用',
  '条件遗漏',
  '公式误用',
  '符号错误',
  '跳步',
  '计算失误',
  '审题偏差',
]

export type BBox = [number, number, number, number] // [x, y, w, h]，单位：图片像素

/* ------------------------------- §9.1 识别结果 ------------------------------ */

export type ChannelSource = 'ocr' | 'vision' | 'merged' | 'student'

export interface OcrBlock {
  id: string
  /** stem 印刷题干 / figure 图形 / table 表格 / note 其他 */
  type: 'stem' | 'figure' | 'table' | 'note'
  text: string
  bbox: BBox
  conf: number
}

export interface OcrFormula {
  id: string
  latex: string
  bbox: BBox
  conf: number
}

export interface VisionStep {
  idx: number
  text: string
  latex: string | null
  bbox: BBox | null
  readable: boolean
  conf: number
  /** verified 双通道一致 / conflict 存在冲突 / unreadable 无法辨认 */
  status: 'verified' | 'conflict' | 'unreadable'
}

export interface RemovedMark {
  idx: number
  reason: 'crossed_out' | 'draft' | 'margin'
  text: string
  bbox: BBox | null
}

export interface DiffItem {
  /** char 字符级 / formula 公式级 / slice 切片级（步骤粒度不一致） */
  level: 'char' | 'formula' | 'slice'
  step: number
  ocr: string | null
  vision: string | null
  status: 'verified' | 'conflict' | 'ocr_only' | 'vision_only'
}

export interface RecognizeResult {
  task_id: string
  image_uri: string
  channel_ocr: {
    stem: OcrBlock[]
    formulas: OcrFormula[]
    layout: { regions: { kind: string; bbox: BBox }[] }
  }
  channel_vision: {
    steps: VisionStep[]
    removed_marks: RemovedMark[]
  }
  diff: DiffItem[]
  /** 追加字段（不删不改 §9 语义） */
  meta: {
    provider_mode: 'mock' | 'live'
    ocr_conf_avg: number
    vision_conf_avg: number
    low_confidence: boolean
    warnings: string[]
    model_trace: { role: string; model: string; ms: number }[]
    /** 演示样本的节点级判分标注；真实模式为 null（由判分模型输出） */
    oracle: {
      node_id: string
      step: number | null
      verdict: 'correct' | 'partial' | 'wrong' | 'missing'
    }[] | null
  }
}

/* ---------------------------- §9.2 ConfirmedSolution --------------------------- */

export interface ConfirmedStep {
  idx: number
  text: string
  latex: string | null
  included: boolean
}

export interface EditLog {
  at: string
  action: 'edit_text' | 'edit_latex' | 'split' | 'merge' | 'reorder' | 'strike' | 'restore' | 'resolve_conflict'
  target: number
  detail: string
}

export interface ConfirmedSolution {
  confirm_id: string
  task_id: string
  confirmed_at: string
  version: number
  steps: ConfirmedStep[]
  student_note: string
  /** 追加字段：留痕 */
  edits: EditLog[]
  excluded_marks: RemovedMark[]
  confirmed_by: string
}

/* ------------------------------ §9.3 题目定位 ------------------------------- */

export interface SolutionNode {
  node_id: string
  goal: string
  formula: string
  depends_on: string[]
  common_errors: ErrorLabel[]
}

export interface StandardSolution {
  method: string
  nodes: SolutionNode[]
  answer: string // LaTeX
}

export interface Question {
  question_id: string
  subject: 'math'
  topic: 'exponential' | 'logarithm'
  chapter: string
  stem: string // 含 $...$ 的富文本
  stem_plain: string // 供试卷图渲染的纯文本（支持 ^{} _{}）
  knowledge_points: string[]
  standard_solution: StandardSolution
  full_derivation: { text: string; latex: string | null }[]
  difficulty: 1 | 2 | 3
  source: { type: 'self_built'; url: null; license_note: string }
}

export interface LocateResult {
  hit: boolean
  question_id: string | null
  stem: string | null
  knowledge_points: string[]
  standard_solution: StandardSolution | null
  source: {
    type: 'bank' | 'user_upload' | 'model_solution'
    url: string | null
    license_note: string
  }
  /** 追加字段 */
  meta: {
    notice: string | null
    matched_by: 'fingerprint' | 'none'
    score: number
    /** 完整推导正文：批改页「解锁」后才由独立接口返回给前端 */
    derivation: { text: string; latex: string | null }[]
    dual_retrieval: {
      enabled: boolean
      reason: string
      candidates: { source: string; question_id: string; score: number }[]
    }
  }
}

/* ------------------------------ §9.4 首次批改 ------------------------------- */

export interface NodeJudgement {
  node_id: string
  verdict: 'correct' | 'partial' | 'missing' | 'wrong' | 'unjudged'
  evidence: string
}

export interface ErrorLocalization {
  first_error_step: number | null
  step_text: string
  /** 追加字段：学生该步的公式（LaTeX），与 step_text 分开展示避免公式被当普通文本 */
  step_latex: string | null
  expected_action: string
  /** 追加字段：标准写法（LaTeX） */
  expected_formula: string
  student_action: string
  primary_label: ErrorLabel | null
  confidence: number
  basis: string
  followup_seeds: string[]
}

export interface SecondaryError {
  step: number
  label: ErrorLabel
}

export interface GradeResult {
  task_id: string
  node_judgement: NodeJudgement[]
  overall: 'correct' | 'partial' | 'wrong' | 'unjudged'
  error_localization: ErrorLocalization
  secondary_errors: SecondaryError[]
  /** §8.3 交付面所需（追加字段，语义取自 standard_solution） */
  answer_latex: string
  method: string
  skeleton: { idx: number; goal: string; formula: string; depends_on: string[] }[]
  /** 完整推导默认收起：此处只给可用性标记，正文走独立接口 */
  full_derivation_locked: boolean
  provenance: {
    question_id: string | null
    source_type: 'bank' | 'model_solution'
    notice: string | null
  }
  meta: {
    model_trace: { role: string; model: string; ms: number }[]
    low_confidence: boolean
  }
}

/* --------------------------------- 任务/上传 -------------------------------- */

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface TaskState {
  task_id: string
  kind: 'recognize' | 'grade'
  owner_id: string
  status: TaskStatus
  stage: string
  progress: number
  error: { code: string; message: string; hint?: string } | null
  created_at: string
  updated_at: string
  usage: { calls: { role: string; model: string; ms: number }[]; total_ms: number }
}

export interface UploadMeta {
  image_id: string
  image_uri: string
  width: number
  height: number
  bytes: number
  sha256: string
  phash: string | null
  mime: string
  dedup_hit: boolean
  duplicate_of: string | null
  sample_id: string | null
}

/* ---------------------------------- 用户 ---------------------------------- */

export interface PublicUser {
  user_id: string
  email: string
  display_name: string
}
