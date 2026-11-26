import { useCallback, useRef, useState } from 'react'
import { api, ApiError, imageUrl, pollTask } from '../lib/api'
import { prepareImage, type PreparedImage } from '../lib/image'
import type {
  BBox,
  ConfirmedSolution,
  DiffItem,
  EditLog,
  ErrorLabel,
  GradeResult,
  LocateResult,
  Meta,
  RecognizeResult,
  RemovedMark,
  TaskState,
} from '../lib/types'

export interface EditableStep {
  key: string
  idx: number
  text: string
  latex: string | null
  included: boolean
  bbox: BBox | null
  conf: number
  status: 'verified' | 'conflict' | 'unreadable'
  conflict: DiffItem | null
  resolvedChoice: 'ocr' | 'vision' | 'manual' | null
}

export type Phase = 'boot' | 'upload' | 'recognizing' | 'confirming' | 'grading' | 'graded'

export interface FlowError {
  title: string
  detail?: string
  hint?: string
}

interface UploadMeta {
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

const EMPTY: FlowState = {
  phase: 'boot',
  meta: null,
  sessionError: null,
  prepared: null,
  sampleId: null,
  isExam: false,
  uploadPct: 0,
  uploading: false,
  uploadMeta: null,
  recognition: null,
  steps: [],
  removedMarks: [],
  task: null,
  confirm: null,
  locate: null,
  grade: null,
  error: null,
  edits: [],
  stageText: '',
}

export interface FlowState {
  phase: Phase
  meta: Meta | null
  sessionError: string | null
  prepared: PreparedImage | null
  sampleId: string | null
  isExam: boolean
  uploadPct: number
  uploading: boolean
  uploadMeta: UploadMeta | null
  recognition: RecognizeResult | null
  steps: EditableStep[]
  removedMarks: RemovedMark[]
  task: TaskState | null
  confirm: ConfirmedSolution | null
  locate: LocateResult | null
  grade: GradeResult | null
  error: FlowError | null
  edits: EditLog[]
  stageText: string
}

let seq = 0
const nextKey = () => `s${++seq}`

export function useFlow() {
  const [state, setState] = useState<FlowState>(EMPTY)
  const preparedRef = useRef<PreparedImage | null>(null)
  const stepsRef = useRef<EditableStep[]>([])
  stepsRef.current = state.steps

  /** 审计日志里记录的是「识别时的步骤序号」，与界面位置解耦，重排后仍可追溯 */
  const idxOf = (key: string) => stepsRef.current.find((s) => s.key === key)?.idx ?? 0

  const patch = useCallback((p: Partial<FlowState>) => {
    setState((s) => ({ ...s, ...p }))
  }, [])

  const pushEdit = useCallback((e: Omit<EditLog, 'at'>) => {
    setState((s) => ({ ...s, edits: [...s.edits, { ...e, at: new Date().toISOString() }] }))
  }, [])

  const bootstrap = useCallback(async () => {
    try {
      const meta = await api.meta()
      setState((s) => ({ ...s, meta, phase: s.phase === 'boot' ? 'upload' : s.phase }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : '无法连接服务端'
      setState((s) => ({ ...s, sessionError: msg, phase: 'upload' }))
    }
  }, [])

  const clearError = useCallback(() => patch({ error: null }), [patch])

  /* ------------------------------ 选图 / 上传 ------------------------------ */

  const doUpload = useCallback(
    async (prepared: PreparedImage, sampleId: string | null, isExam: boolean) => {
      patch({ uploading: true, uploadPct: 0, error: null })
      try {
        const meta = (await api.upload(
          prepared.blob,
          prepared.name,
          { sampleId, phash: prepared.phash, isExam },
          (pct) => patch({ uploadPct: pct }),
        )) as UploadMeta
        patch({
          uploadMeta: meta,
          uploading: false,
          uploadPct: 100,
          sampleId,
          isExam,
          phase: 'upload',
        })
      } catch (e) {
        const err = e as ApiError
        patch({
          uploading: false,
          error: {
            title: '图片上传失败',
            detail: err.message,
            hint: err.code === 'FILE_TOO_LARGE' ? '请压缩后重试，或换一张照片' : undefined,
          },
        })
      }
    },
    [patch],
  )

  const pickFile = useCallback(
    async (file: File, isExam: boolean) => {
      patch({ error: null })
      try {
        const prepared = await prepareImage(file)
        preparedRef.current = prepared
        patch({ prepared, isExam, sampleId: null, uploadMeta: null })
        await doUpload(prepared, null, isExam)
      } catch (e) {
        patch({
          error: {
            title: '照片处理失败',
            detail: e instanceof Error ? e.message : '无法读取该图片',
            hint: '请换一张 JPG/PNG 图片重试',
          },
        })
      }
    },
    [doUpload, patch],
  )

  const pickSample = useCallback(
    async (sampleId: string, imageUrlPath: string, isExam: boolean) => {
      patch({ error: null, uploading: true, uploadPct: 0 })
      try {
        // 走真实链路：下载样本图 → 客户端预处理 → 上传 → 再识别
        const res = await fetch(imageUrlPath)
        if (!res.ok) throw new Error('样本图片加载失败')
        const blob = await res.blob()
        const file = new File([blob], `${sampleId}.png`, { type: blob.type || 'image/png' })
        const prepared = await prepareImage(file)
        preparedRef.current = prepared
        patch({ prepared, sampleId, isExam })
        await doUpload(prepared, sampleId, isExam)
      } catch (e) {
        patch({
          uploading: false,
          error: {
            title: '演示样本加载失败',
            detail: e instanceof Error ? e.message : '未知错误',
            hint: '请确认服务端已启动并生成样本图（npm run samples）',
          },
        })
      }
    },
    [doUpload, patch],
  )

  const setExamFlag = useCallback(
    (v: boolean) => patch({ isExam: v }),
    [patch],
  )

  /* -------------------------------- 识别 -------------------------------- */

  const startRecognize = useCallback(async () => {
    if (!state.uploadMeta) return
    patch({ phase: 'recognizing', error: null, task: null, stageText: '提交识别任务' })
    try {
      const { task_id } = await api.recognize(state.uploadMeta.image_id, state.isExam)
      const done = await pollTask(task_id, (t) =>
        setState((s) => ({ ...s, task: t, stageText: t.stage })),
      )
      if (done.status === 'failed') {
        patch({
          phase: 'upload',
          error: {
            title: '识别失败',
            detail: done.error?.message ?? '未知错误',
            hint: done.error?.hint,
          },
        })
        return
      }
      const rec = await api.recognition(task_id)
      const steps: EditableStep[] = rec.channel_vision.steps.map((s) => ({
        key: nextKey(),
        idx: s.idx,
        text: s.text,
        latex: s.latex,
        included: true,
        bbox: s.bbox,
        conf: s.conf,
        status: s.status,
        conflict: rec.diff.find((d) => d.step === s.idx && d.status === 'conflict') ?? null,
        resolvedChoice: null,
      }))
      patch({
        phase: 'confirming',
        recognition: rec,
        steps,
        removedMarks: rec.channel_vision.removed_marks,
        task: done,
      })
    } catch (e) {
      const err = e as ApiError
      patch({
        phase: 'upload',
        error: { title: '识别任务失败', detail: err.message, hint: err.hint },
      })
    }
  }, [patch, state.uploadMeta])

  /* ------------------------------ 步骤编辑 ------------------------------ */

  const setSteps = useCallback((fn: (prev: EditableStep[]) => EditableStep[]) => {
    setState((s) => ({ ...s, steps: fn(s.steps) }))
  }, [])

  const updateText = useCallback(
    (key: string, text: string) => {
      setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, text } : s)))
      pushEdit({ action: 'edit_text', target: idxOf(key), detail: text.slice(0, 40) })
    },
    [pushEdit, setSteps],
  )

  const updateLatex = useCallback(
    (key: string, latex: string) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.key === key
            ? {
                ...s,
                latex: latex.trim() ? latex : null,
                resolvedChoice: s.conflict && latex.trim() ? 'manual' : s.resolvedChoice,
              }
            : s,
        ),
      )
      pushEdit({ action: 'edit_latex', target: idxOf(key), detail: latex.slice(0, 40) })
    },
    [pushEdit, setSteps],
  )

  const moveStep = useCallback(
    (key: string, dir: -1 | 1) => {
      setState((s) => {
        const i = s.steps.findIndex((x) => x.key === key)
        const j = i + dir
        if (i < 0 || j < 0 || j >= s.steps.length) return s
        const next = [...s.steps]
        ;[next[i], next[j]] = [next[j], next[i]]
        return { ...s, steps: next }
      })
      pushEdit({ action: 'reorder', target: idxOf(key), detail: dir === -1 ? '上移' : '下移' })
    },
    [pushEdit],
  )

  const splitStep = useCallback(
    (key: string, position: number) => {
      setState((s) => {
        const i = s.steps.findIndex((x) => x.key === key)
        if (i < 0) return s
        const cur = s.steps[i]
        const cut = Math.max(1, Math.min(position, cur.text.length - 1))
        if (cur.text.length < 2) return s
        const first: EditableStep = { ...cur, text: cur.text.slice(0, cut).trim(), key: cur.key }
        const second: EditableStep = {
          ...cur,
          key: nextKey(),
          text: cur.text.slice(cut).trim() || '（补写步骤）',
          latex: null,
          conf: cur.conf,
          conflict: null,
          resolvedChoice: null,
        }
        const next = [...s.steps]
        next.splice(i, 1, first, second)
        return { ...s, steps: next }
      })
      pushEdit({ action: 'split', target: idxOf(key), detail: `在第 ${position} 字处拆分` })
    },
    [pushEdit],
  )

  const mergeStep = useCallback(
    (key: string) => {
      setState((s) => {
        const i = s.steps.findIndex((x) => x.key === key)
        if (i < 0 || i >= s.steps.length - 1) return s
        const a = s.steps[i]
        const b = s.steps[i + 1]
        const merged: EditableStep = {
          ...a,
          text: `${a.text}；${b.text}`,
          latex: a.latex ?? b.latex,
          conflict: a.conflict ?? b.conflict,
          conf: Math.min(a.conf, b.conf),
        }
        const next = [...s.steps]
        next.splice(i, 2, merged)
        return { ...s, steps: next }
      })
      pushEdit({ action: 'merge', target: idxOf(key), detail: '与下一步合并' })
    },
    [pushEdit],
  )

  const toggleInclude = useCallback(
    (key: string) => {
      let nowIncluded = true
      setState((s) => ({
        ...s,
        steps: s.steps.map((x) => {
          if (x.key !== key) return x
          nowIncluded = !x.included
          return { ...x, included: !x.included }
        }),
      }))
      pushEdit({
        action: nowIncluded ? 'restore' : 'strike',
        target: idxOf(key),
        detail: nowIncluded ? '恢复该步骤' : '标记为划掉（不计入解答）',
      })
    },
    [pushEdit],
  )

  const resolveConflict = useCallback(
    (key: string, choice: 'ocr' | 'vision') => {
      setSteps((prev) =>
        prev.map((s) => {
          if (s.key !== key || !s.conflict) return s
          const value = choice === 'ocr' ? s.conflict.ocr : s.conflict.vision
          return {
            ...s,
            latex: value ?? s.latex,
            resolvedChoice: choice,
          }
        }),
      )
      pushEdit({
        action: 'resolve_conflict',
        target: idxOf(key),
        detail: choice === 'ocr' ? '采纳印刷/公式通道读数' : '采纳手写通道读数',
      })
    },
    [pushEdit, setSteps],
  )

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      {
        key: nextKey(),
        idx: prev.length + 1,
        text: '',
        latex: null,
        included: true,
        bbox: null,
        conf: 1,
        status: 'verified',
        conflict: null,
        resolvedChoice: null,
      },
    ])
    pushEdit({ action: 'edit_text', target: 0, detail: '手动补充步骤' })
  }, [pushEdit, setSteps])

  const removeStep = useCallback(
    (key: string) => {
      setSteps((prev) => prev.filter((s) => s.key !== key))
      pushEdit({ action: 'strike', target: idxOf(key), detail: '删除空步骤' })
    },
    [pushEdit, setSteps],
  )

  /* -------------------------------- 确认 -------------------------------- */

  const unresolvedConflicts = state.steps
    .filter((s) => s.included && s.conflict && !s.resolvedChoice)
    .map((s) => s.idx)

  const canConfirm = state.steps.some((s) => s.included) && unresolvedConflicts.length === 0

  const confirmSolution = useCallback(
    async (studentNote: string) => {
      if (!state.recognition) return
      const payload = {
        task_id: state.recognition.task_id,
        steps: state.steps.map((s, i) => ({
          idx: i + 1,
          text: s.text,
          latex: s.latex,
          included: s.included,
        })),
        student_note: studentNote,
        edits: state.edits,
        resolved_conflicts: state.steps.filter((s) => s.conflict && s.resolvedChoice).map((s) => s.idx),
      }
      patch({ phase: 'grading', stageText: '正在提交确认结果', error: null, grade: null, locate: null })
      try {
        const confirm = await api.confirm(payload)
        patch({ confirm, stageText: '题库检索中' })
        const locate = await api.locate(confirm.confirm_id)
        patch({ locate, stageText: '生成批改报告' })
        const { task_id } = await api.grade(confirm.confirm_id)
        const done = await pollTask(task_id, (t) => setState((s) => ({ ...s, task: t, stageText: t.stage })))
        if (done.status === 'failed') {
          patch({
            phase: 'confirming',
            error: {
              title: '批改失败',
              detail: done.error?.message ?? '未知错误',
              hint: done.error?.hint,
            },
          })
          return
        }
        const grade = await api.grading(task_id)
        patch({ phase: 'graded', grade, task: done })
      } catch (e) {
        const err = e as ApiError
        patch({
          phase: 'confirming',
          error: { title: '批改流程中断', detail: err.message, hint: err.hint },
        })
      }
    },
    [patch, state.edits, state.recognition, state.steps],
  )

  /* -------------------------------- 重置 -------------------------------- */

  const reset = useCallback(() => {
    if (preparedRef.current) URL.revokeObjectURL(preparedRef.current.url)
    preparedRef.current = null
    setState((s) => ({ ...EMPTY, meta: s.meta, phase: 'upload' }))
  }, [])

  const imageSrc = state.uploadMeta
    ? imageUrl(state.uploadMeta.image_uri)
    : state.prepared?.url ?? ''

  return {
    state,
    imageSrc,
    unresolvedConflicts,
    canConfirm,
    bootstrap,
    pickFile,
    pickSample,
    setExamFlag,
    startRecognize,
    updateText,
    updateLatex,
    moveStep,
    splitStep,
    mergeStep,
    toggleInclude,
    resolveConflict,
    addStep,
    removeStep,
    confirmSolution,
    reset,
    clearError,
  }
}

export type FlowApi = ReturnType<typeof useFlow>
export type { ErrorLabel }
