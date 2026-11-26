import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { imageSize } from 'image-size'
import { requireUser } from '../auth'
import { UPLOAD_DIR } from '../env'
import { ApiError, err } from '../lib/errors'
import { newId, nowIso } from '../lib/util'
import { phashDistance, repo } from '../store/db'
import type { ImageRec, RecognitionRec } from '../store/db'
import { call, type CallTrace, type OcrOutput, type VisionOutput } from '../gateway'
import { applyDiffToSteps, avgConf, buildDiff } from '../merge/diff'
import { publicTask, startTask } from '../tasks'
import { locateQuestion } from '../locate/service'
import { gradeConfirmed } from '../grade/service'
import { SAMPLE_ORACLE } from '../bank/samples'
import type {
  ConfirmedSolution,
  ConfirmedStep,
  ErrorLabel,
  GradeResult,
  LocateResult,
  RecognizeResult,
} from '../types'
import { ERROR_LABELS } from '../types'

function extOf(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('heic')) return 'heic'
  return 'jpg'
}

export default async function flowRoutes(app: FastifyInstance) {
  /* ------------------------------- 上传 ------------------------------- */

  // 预留预签名直传形态：真实对象存储接入时把 upload_url 换成 OSS/S3 的预签名地址即可
  app.post('/api/uploads/presign', async () => ({
    mode: 'local_proxy',
    upload_url: '/api/uploads',
    fields: { sample_id: '', phash: '', is_exam_question: 'false' },
    expires_in: 600,
    note: 'MVP 以本地文件目录模拟对象存储，接口形态与预签名一致',
  }))

  app.post('/api/uploads', async (req) => {
    const user = requireUser(req)
    const file = await req.file({ limits: { fileSize: 12 * 1024 * 1024 } })
    if (!file) throw err.badRequest('缺少图片文件', 'NO_FILE')

    const buf = await file.toBuffer()
    if (!buf.length) throw err.badRequest('图片为空', 'EMPTY_FILE')
    if (!file.mimetype.startsWith('image/')) throw err.badRequest('只接受图片文件', 'BAD_MIME')

    const fields = file.fields as Record<string, { value?: unknown } | undefined>
    const sampleIdRaw = fields.sample_id?.value
    let sampleId = typeof sampleIdRaw === 'string' && sampleIdRaw ? sampleIdRaw : null
    // 兜底：multipart 流中字段可能晚于文件到达，允许用查询参数补传
    if (!sampleId) {
      const q = (req.query as Record<string, unknown> | undefined)?.sample_id
      if (typeof q === 'string' && q) sampleId = q
    }
    const phashRaw = fields.phash?.value
    const phash = typeof phashRaw === 'string' && /^[0-9a-f]{8,32}$/i.test(phashRaw) ? phashRaw : null
    const isExam = String(fields.is_exam_question?.value ?? 'false') === 'true'

    const sha256 = crypto.createHash('sha256').update(buf).digest('hex')

    // 去重：同 owner、同样本归属下，精确哈希或感知哈希汉明距离 ≤5（阈值可配，文档未锁定数值）
    // 未绑定样本的图片不参与去重，避免把演示样本误判为已有记录
    const dup = sampleId ? repo.findDuplicate(user.user_id, sha256, phash, sampleId) : undefined
    if (dup) {
      return {
        image_id: dup.image_id,
        image_uri: dup.uri,
        width: dup.width,
        height: dup.height,
        bytes: dup.bytes,
        sha256: dup.sha256,
        phash: dup.phash,
        mime: dup.mime,
        dedup_hit: true,
        duplicate_of: dup.image_id,
        sample_id: dup.sample_id,
      }
    }

    let width = 0
    let height = 0
    try {
      const dim = imageSize(buf)
      width = dim.width ?? 0
      height = dim.height ?? 0
    } catch {
      // 尺寸解析失败不阻塞上传，前端已有本地尺寸
    }

    const image_id = newId('img')
    const filename = `${image_id}.${extOf(file.mimetype)}`
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf)

    const rec: ImageRec = {
      image_id,
      owner_id: user.user_id,
      file: filename,
      uri: `/api/images/${image_id}`,
      width,
      height,
      bytes: buf.length,
      sha256,
      phash,
      mime: file.mimetype,
      sample_id: sampleId,
      is_exam_question: isExam,
      created_at: nowIso(),
    }
    repo.insertImage(rec)

    return {
      image_id,
      image_uri: rec.uri,
      width,
      height,
      bytes: rec.bytes,
      sha256,
      phash,
      mime: rec.mime,
      dedup_hit: false,
      duplicate_of: null,
      sample_id: sampleId,
    }
  })

  app.get('/api/images/:image_id', async (req, reply) => {
    const user = requireUser(req)
    const { image_id } = req.params as { image_id: string }
    const img = repo.getImageOwned(image_id, user.user_id)
    if (!img) throw err.notFound('图片')
    const full = path.join(UPLOAD_DIR, img.file)
    if (!fs.existsSync(full)) throw err.notFound('图片文件')
    reply.type(img.mime).header('cache-control', 'private, max-age=3600')
    return reply.send(fs.createReadStream(full))
  })

  /* ------------------------------- 识别 ------------------------------- */

  app.post('/api/recognize', async (req) => {
    const user = requireUser(req)
    const { image_id, is_exam_question } = (req.body ?? {}) as {
      image_id?: string
      is_exam_question?: boolean
    }
    const img = repo.getImageOwned(String(image_id ?? ''), user.user_id)
    if (!img) throw err.notFound('图片')

    // 真题标记可在识别前调整，服务端以最新标记做内容合规闸门（§4）
    if (typeof is_exam_question === 'boolean' && img.is_exam_question !== is_exam_question) {
      repo.setImageExamFlag(img.image_id, user.user_id, is_exam_question)
      img.is_exam_question = is_exam_question
    }

    const trace: CallTrace[] = []
    const task = startTask('recognize', user.user_id, async (ctx) => {
      const buf = fs.readFileSync(path.join(UPLOAD_DIR, img.file))
      const imageBase64 = buf.toString('base64')

      ctx.setStage('版面切分', 12)
      const ocr = await call<OcrOutput>(
        'ocr',
        { imageBase64, mime: img.mime, sampleId: img.sample_id, isExamQuestion: img.is_exam_question },
        trace,
      )

      ctx.setStage('手写识别与切片', 52)
      const vision = await call<VisionOutput>(
        'vision',
        { imageBase64, mime: img.mime, sampleId: img.sample_id, isExamQuestion: img.is_exam_question },
        trace,
      )

      ctx.setStage('双通道互校', 82)
      const diff = buildDiff(ocr.formulas, vision.steps)
      const steps = applyDiffToSteps(vision.steps, diff)

      const visionAvg = avgConf(steps.map((s) => s.conf))
      const warnings: string[] = []
      if (!img.sample_id && trace[0]?.model.startsWith('mock')) {
        warnings.push('该图片未绑定演示样本，当前演示模式下无法产生识别结果')
      }
      if (steps.some((s) => s.conf < 0.6)) warnings.push('存在置信度低于 0.6 的步骤，已标记为待确认')
      if (diff.some((d) => d.status === 'conflict')) warnings.push('双通道存在读数冲突，需在确认页裁定')

      const result: RecognizeResult = {
        task_id: ctx.task_id,
        image_uri: `/api/images/${img.image_id}`,
        channel_ocr: { stem: ocr.stem, formulas: ocr.formulas, layout: ocr.layout },
        channel_vision: { steps, removed_marks: vision.removed_marks },
        diff,
        meta: {
          provider_mode: trace[0]?.model.startsWith('mock') ? 'mock' : 'live',
          ocr_conf_avg: avgConf(ocr.formulas.map((f) => f.conf)),
          vision_conf_avg: visionAvg,
          low_confidence: visionAvg < 0.7 || steps.some((s) => s.conf < 0.6),
          warnings,
          model_trace: trace,
          oracle: img.sample_id ? SAMPLE_ORACLE[img.sample_id] ?? null : null,
        },
      }

      const rec: RecognitionRec = {
        ...result,
        image_id: img.image_id,
        owner_id: user.user_id,
        sample_id: img.sample_id,
        created_at: nowIso(),
      }
      repo.insertRecognition(rec)
      ctx.setStage('整理结果', 95)
    })

    return { task_id: task.task_id }
  })

  app.get('/api/tasks/:task_id', async (req) => {
    const user = requireUser(req)
    const { task_id } = req.params as { task_id: string }
    const task = repo.getTask(task_id)
    if (!task || task.owner_id !== user.user_id) throw err.notFound('任务')
    return {
      ...publicTask(task),
      result_ready:
        task.status === 'succeeded' &&
        Boolean(repo.getRecognition(task_id) || repo.getGrading(task_id)),
    }
  })

  app.get('/api/recognitions/:task_id', async (req) => {
    const user = requireUser(req)
    const { task_id } = req.params as { task_id: string }
    const rec = repo.getRecognition(task_id)
    if (!rec || rec.owner_id !== user.user_id) throw err.notFound('识别结果')
    const { owner_id, ...rest } = rec
    return rest
  })

  /* ------------------------------ 回显确认 ------------------------------ */

  app.post('/api/solutions/confirm', async (req) => {
    const user = requireUser(req)
    const body = (req.body ?? {}) as {
      task_id?: string
      steps?: ConfirmedStep[]
      student_note?: string
      edits?: ConfirmedSolution['edits']
      resolved_conflicts?: number[]
    }

    const rec = repo.getRecognition(String(body.task_id ?? ''))
    if (!rec || rec.owner_id !== user.user_id) throw err.notFound('识别结果')

    const steps = Array.isArray(body.steps) ? body.steps : []
    if (!steps.length) throw err.badRequest('至少保留 1 个步骤', 'EMPTY_SOLUTION')
    if (!steps.some((s) => s.included)) {
      throw err.badRequest('所有步骤都被划掉，无法进入批改', 'EMPTY_SOLUTION')
    }

    const cleanSteps: ConfirmedStep[] = steps.map((s, i) => {
      const text = String(s.text ?? '').slice(0, 2000)
      const latex = s.latex ? String(s.latex).slice(0, 2000) : null
      if (!text && !latex) throw err.badRequest(`第 ${i + 1} 步内容为空`, 'EMPTY_STEP')
      return { idx: i + 1, text, latex, included: Boolean(s.included) }
    })

    // 服务端二次校验：冲突项必须已裁定，不存在「忽略冲突直接确认」的路径
    const conflictSteps = rec.diff.filter((d) => d.status === 'conflict').map((d) => d.step)
    const resolved = new Set((body.resolved_conflicts ?? []).map(Number))
    const unresolved = conflictSteps.filter((s) => !resolved.has(s))
    if (unresolved.length) {
      throw new ApiError(
        409,
        'CONFLICT_UNRESOLVED',
        `第 ${unresolved.join('、')} 步的双通道冲突尚未裁定`,
        '每个冲突项必须选择其中一个候选或自行改写后才能确认',
      )
    }

    const prev = repo.listConfirmationsByTask(rec.task_id)
    const solution: ConfirmedSolution = {
      confirm_id: newId('cfm'),
      task_id: rec.task_id,
      confirmed_at: nowIso(),
      version: prev.length + 1,
      steps: cleanSteps,
      student_note: String(body.student_note ?? '').slice(0, 1000),
      edits: Array.isArray(body.edits) ? body.edits.slice(0, 200) : [],
      excluded_marks: rec.channel_vision.removed_marks,
      confirmed_by: user.user_id,
    }
    repo.insertConfirmation(solution)
    return solution
  })

  app.get('/api/solutions/:confirm_id', async (req) => {
    const user = requireUser(req)
    const { confirm_id } = req.params as { confirm_id: string }
    const sol = repo.getConfirmation(confirm_id)
    if (!sol || sol.confirmed_by !== user.user_id) throw err.notFound('确认结果')
    return sol
  })

  /* ------------------------------ 题目定位 ------------------------------ */

  async function ensureLocate(sol: ConfirmedSolution, userId: string): Promise<LocateResult> {
    const cached = repo.getLocate(sol.confirm_id)
    if (cached) return cached
    const rec = repo.getRecognition(sol.task_id)
    if (!rec || rec.owner_id !== userId) throw err.notFound('识别结果')
    const img = repo.getImage(rec.image_id)
    const trace: CallTrace[] = []
    const result = await locateQuestion(rec, img?.sample_id ?? null, trace)
    repo.insertLocate({ confirm_id: sol.confirm_id, owner_id: userId, result, created_at: nowIso() })
    return result
  }

  app.post('/api/locate', async (req) => {
    const user = requireUser(req)
    const { confirm_id } = (req.body ?? {}) as { confirm_id?: string }
    const sol = repo.getConfirmation(String(confirm_id ?? ''))
    if (!sol || sol.confirmed_by !== user.user_id) throw err.notFound('确认结果')
    const result = await ensureLocate(sol, user.user_id)
    // 不在定位阶段返回完整推导正文，避免前端提前拿到「收起」的内容
    return { ...result, meta: { ...result.meta, derivation: [] } }
  })

  /* ------------------------------ 首次批改 ------------------------------ */

  app.post('/api/grade', async (req) => {
    const user = requireUser(req)
    const { confirm_id } = (req.body ?? {}) as { confirm_id?: string }
    const sol = repo.getConfirmation(String(confirm_id ?? ''))
    if (!sol || sol.confirmed_by !== user.user_id) throw err.confirmRequired()

    // 版本校验：批改只认最新一次确认，旧版本失效
    const versions = repo.listConfirmationsByTask(sol.task_id)
    const latest = Math.max(...versions.map((v) => v.version))
    if (sol.version !== latest) {
      throw new ApiError(409, 'STALE_CONFIRM', '该确认版本已被新的确认覆盖，请使用最新版本批改')
    }

    const located = await ensureLocate(sol, user.user_id)
    const standard = located.standard_solution
    if (!standard) throw new ApiError(502, 'NO_STANDARD_SOLUTION', '题库与模型均未给出可用解答')

    const trace: CallTrace[] = []
    const task = startTask('grade', user.user_id, async (ctx) => {
      const rec = repo.getRecognition(sol.task_id)
      ctx.setStage('读取确认结果', 25)
      const result: GradeResult = gradeConfirmed({
        confirmed: sol,
        grade_task_id: ctx.task_id,
        nodes: standard.nodes,
        answer: standard.answer,
        method: standard.method,
        question_id: located.question_id,
        source_type: located.source.type === 'bank' ? 'bank' : 'model_solution',
        notice: located.meta.notice,
        trace,
        oracle: rec?.meta.oracle ?? null,
        origSteps: rec?.channel_vision.steps.map((s) => ({ idx: s.idx, text: s.text, latex: s.latex })),
      })
      ctx.setStage('生成批改报告', 80)
      repo.insertGrading(
        {
          task_id: ctx.task_id,
          confirm_id: sol.confirm_id,
          owner_id: user.user_id,
          result,
          derivation: located.meta.derivation ?? [],
          created_at: nowIso(),
        },
        (located.stem ?? '').slice(0, 90),
      )
    })

    return { task_id: task.task_id }
  })

  app.get('/api/gradings/:task_id', async (req) => {
    const user = requireUser(req)
    const { task_id } = req.params as { task_id: string }
    const g = repo.getGrading(task_id)
    if (!g || g.owner_id !== user.user_id) throw err.notFound('批改结果')
    const note = repo.getNote(task_id)
    return { ...g.result, student_free_note: note?.note ?? '' }
  })

  /** 完整推导默认收起：只有显式调用本接口才下发正文 */
  app.get('/api/gradings/:task_id/derivation', async (req) => {
    const user = requireUser(req)
    const { task_id } = req.params as { task_id: string }
    const g = repo.getGrading(task_id)
    if (!g || g.owner_id !== user.user_id) throw err.notFound('批改结果')
    return {
      task_id,
      unlocked_at: nowIso(),
      derivation: g.derivation,
      note: '完整推导仅本次展示，不改变首错步与主错因标签',
    }
  })

  /** 自由补充：仅本人可见、不入统计 */
  app.patch('/api/gradings/:task_id/note', async (req) => {
    const user = requireUser(req)
    const { task_id } = req.params as { task_id: string }
    const g = repo.getGrading(task_id)
    if (!g || g.owner_id !== user.user_id) throw err.notFound('批改结果')
    const { note } = (req.body ?? {}) as { note?: string }
    const text = String(note ?? '').slice(0, 500)
    repo.upsertNote(task_id, user.user_id, text)
    return { ok: true, note: text, visibility: 'self_only', counted_in_stats: false }
  })

  app.get('/api/labels', async () => ({ labels: ERROR_LABELS as ErrorLabel[] }))
}
