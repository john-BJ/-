/** 前端契约类型：与 BFF 的 §9 字段一一对应（snake_case，勿改名） */

export type ErrorLabel =
  | '概念误用'
  | '条件遗漏'
  | '公式误用'
  | '符号错误'
  | '跳步'
  | '计算失误'
  | '审题偏差'

export type BBox = [number, number, number, number]

export interface OcrBlock {
  id: string
  type: string
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
  status: 'verified' | 'conflict' | 'unreadable'
}

export interface RemovedMark {
  idx: number
  reason: 'crossed_out' | 'draft' | 'margin'
  text: string
  bbox: BBox | null
}

export interface DiffItem {
  level: 'char' | 'formula' | 'slice'
  step: number
  ocr: string | null
  vision: string | null
  status: 'verified' | 'conflict' | 'ocr_only' | 'vision_only'
}

export interface RecognizeResult {
  task_id: string
  image_uri: string
  channel_ocr: { stem: OcrBlock[]; formulas: OcrFormula[]; layout: { regions: { kind: string; bbox: BBox }[] } }
  channel_vision: { steps: VisionStep[]; removed_marks: RemovedMark[] }
  diff: DiffItem[]
  meta: {
    provider_mode: 'mock' | 'live'
    ocr_conf_avg: number
    vision_conf_avg: number
    low_confidence: boolean
    warnings: string[]
    model_trace: { role: string; model: string; ms: number }[]
    oracle: { node_id: string; step: number | null; verdict: string }[] | null
  }
}

export interface ConfirmedStep {
  idx: number
  text: string
  latex: string | null
  included: boolean
}

export interface EditLog {
  at: string
  action:
    | 'edit_text'
    | 'edit_latex'
    | 'split'
    | 'merge'
    | 'reorder'
    | 'strike'
    | 'restore'
    | 'resolve_conflict'
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
  edits: EditLog[]
  excluded_marks: RemovedMark[]
  confirmed_by: string
}

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
  answer: string
}

export interface LocateResult {
  hit: boolean
  question_id: string | null
  stem: string | null
  knowledge_points: string[]
  standard_solution: StandardSolution | null
  source: { type: 'bank' | 'user_upload' | 'model_solution'; url: string | null; license_note: string }
  meta: {
    notice: string | null
    matched_by: 'fingerprint' | 'none'
    score: number
    derivation: { text: string; latex: string | null }[]
    dual_retrieval: { enabled: boolean; reason: string; candidates: { source: string; question_id: string; score: number }[] }
  }
}

export interface GradeResult {
  task_id: string
  node_judgement: { node_id: string; verdict: string; evidence: string }[]
  overall: 'correct' | 'partial' | 'wrong' | 'unjudged'
  error_localization: {
    first_error_step: number | null
    step_text: string
    step_latex: string | null
    expected_action: string
    expected_formula: string
    student_action: string
    primary_label: ErrorLabel | null
    confidence: number
    basis: string
    followup_seeds: string[]
  }
  secondary_errors: { step: number; label: ErrorLabel }[]
  answer_latex: string
  method: string
  skeleton: { idx: number; goal: string; formula: string; depends_on: string[] }[]
  full_derivation_locked: boolean
  provenance: { question_id: string | null; source_type: 'bank' | 'model_solution'; notice: string | null }
  meta: { model_trace: { role: string; model: string; ms: number }[]; low_confidence: boolean }
  student_free_note?: string
}

export interface TaskState {
  task_id: string
  kind: 'recognize' | 'grade'
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  stage: string
  progress: number
  error: { code: string; message: string; hint?: string } | null
  result_ready: boolean
}

export interface Meta {
  mode: { mode: string; provider: string; models: Record<string, string> }
  is_mock: boolean
  error_labels: ErrorLabel[]
  samples: { sample_id: string; title: string; tag: string; image_url: string; question_id: string | null }[]
  bank: { math_questions: number; exponential: number; logarithm: number }
  features: Record<string, boolean>
}

export interface Question {
  question_id: string
  topic: 'exponential' | 'logarithm'
  chapter: string
  stem: string
  knowledge_points: string[]
  standard_solution: StandardSolution
  difficulty: number
  source: { license_note: string }
}

export interface GraphChapter {
  chapter: string
  book: string
  concepts: string[]
  formulas: string[]
  methods: string[]
  traps: string[]
}

export interface SubjectGraph {
  subject: 'math' | 'physics'
  title: string
  source: string
  verified: boolean
  lines: { line: string; desc: string; chapters: GraphChapter[] }[]
}
