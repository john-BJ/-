import { env } from '../env'
import { ApiError } from '../lib/errors'
import { ERROR_LABELS } from '../types'
import type { ErrorLabel, OcrBlock, OcrFormula, RemovedMark, SolutionNode, VisionStep } from '../types'
import type { OcrOutput, VisionOutput } from './mock'

/**
 * Live Provider：通过 OpenAI 兼容协议调用真实模型。
 *
 * ⚠ 本文件为「按技术说明 §2.3 实现、但本轮未联调」的通道：
 *    密钥留空时网关会自动走 mock；填入密钥后若返回结构不符，一律抛 MODEL_BAD_OUTPUT，
 *    由前端呈现错误态，绝不把不可信输出当成识别结果（§4 不编造）。
 */

const JSON_ONLY = '只输出一个 JSON 对象，不要输出解释、不要使用 Markdown 代码块。'

async function postChat(
  baseUrl: string,
  key: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const retryable = res.status === 429 || res.status >= 500
      const hint =
        res.status === 401 || res.status === 403
          ? '密钥无效或权限不足，请检查 .env 中的 KEY'
          : res.status === 404
            ? '模型名可能不存在，或该模型不支持 /chat/completions，请调整 MODEL_* 配置'
            : res.status === 400
              ? '请求被上游拒绝，常见原因是模型不支持图片输入或参数不合法'
              : undefined
      throw new ApiError(
        retryable ? 503 : 502,
        retryable ? 'MODEL_UPSTREAM_BUSY' : 'MODEL_UPSTREAM_ERROR',
        `模型服务返回 ${res.status}`,
        hint ? `${hint}${text ? `（${text.slice(0, 120)}）` : ''}` : text.slice(0, 200),
      )
    }
    const data = (await res.json()) as any
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new ApiError(502, 'MODEL_EMPTY_OUTPUT', '模型返回空内容')
    }
    return content
  } finally {
    clearTimeout(timer)
  }
}

function parseJsonObject(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new ApiError(502, 'MODEL_BAD_OUTPUT', '模型输出不是合法 JSON')
  }
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new ApiError(502, 'MODEL_BAD_OUTPUT', '模型输出 JSON 解析失败')
  }
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function bboxOf(v: unknown): [number, number, number, number] | null {
  if (!Array.isArray(v) || v.length < 4) return null
  const b = v.slice(0, 4).map((x) => num(x, 0)) as [number, number, number, number]
  return b.every((x) => Number.isFinite(x)) ? b : null
}

export async function liveOcr(input: {
  imageBase64: string
  mime: string
  timeoutMs: number
}): Promise<OcrOutput> {
  const content = await postChat(
    env.siliconflow.baseUrl,
    env.siliconflow.keyOcr,
    {
      model: env.siliconflow.modelOcr,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            '你是试卷版面与公式 OCR 引擎。识别印刷体题干、公式与版面区域，不要识别手写内容。' +
            JSON_ONLY +
            '若某处无法辨认，请把 conf 设为 0.3 以下并在 text 中保留你能看到的部分，禁止猜测补全。',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                '按此 schema 输出：{"stem":[{"id":"b1","type":"stem","text":"","bbox":[x,y,w,h],"conf":0.9}],' +
                '"formulas":[{"id":"f1","latex":"","bbox":[x,y,w,h],"conf":0.9}],' +
                '"layout":{"regions":[{"kind":"stem","bbox":[x,y,w,h]}]}}。latex 用标准 LaTeX，不要化简。',
            },
            { type: 'image_url', image_url: { url: `data:${input.mime};base64,${input.imageBase64}` } },
          ],
        },
      ],
    },
    input.timeoutMs,
  )

  const raw = parseJsonObject(content)
  if (!Array.isArray(raw?.stem) || !Array.isArray(raw?.formulas)) {
    throw new ApiError(502, 'MODEL_BAD_OUTPUT', 'OCR 输出缺少 stem / formulas 数组')
  }

  const stem: OcrBlock[] = raw.stem
    .map((b: any, i: number) => {
      const bbox = bboxOf(b?.bbox)
      if (!bbox) return null
      return {
        id: String(b?.id ?? `b${i + 1}`),
        type: 'stem' as const,
        text: String(b?.text ?? ''),
        bbox,
        conf: num(b?.conf, 0.5),
      }
    })
    .filter(Boolean) as OcrBlock[]

  const formulas: OcrFormula[] = raw.formulas
    .map((f: any, i: number) => {
      const bbox = bboxOf(f?.bbox)
      if (!bbox) return null
      return {
        id: String(f?.id ?? `f${i + 1}`),
        latex: String(f?.latex ?? ''),
        bbox,
        conf: num(f?.conf, 0.5),
      }
    })
    .filter(Boolean) as OcrFormula[]

  return { stem, formulas, layout: { regions: [] } }
}

export async function liveVision(input: {
  imageBase64: string
  mime: string
  timeoutMs: number
}): Promise<VisionOutput> {
  const content = await postChat(
    env.zhipu.baseUrl,
    env.zhipu.keyGlm,
    {
      model: env.zhipu.modelGlm,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            '你是手写解题过程识别引擎。逐行切片学生的书写步骤，保留原始写法，不要纠正错误、不要补全步骤。' +
            '被划掉/涂改的内容放进 removed_marks，不要混入 steps。' + JSON_ONLY,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                '按此 schema 输出：{"steps":[{"idx":1,"text":"","latex":"","bbox":[x,y,w,h],"readable":true,"conf":0.8,' +
                '"status":"verified"}],"removed_marks":[{"idx":1,"reason":"crossed_out","text":"","bbox":[x,y,w,h]}]}。' +
                '公式用 LaTeX；看不清的步骤 readable=false、conf<0.4。',
            },
            { type: 'image_url', image_url: { url: `data:${input.mime};base64,${input.imageBase64}` } },
          ],
        },
      ],
    },
    input.timeoutMs,
  )

  const raw = parseJsonObject(content)
  if (!Array.isArray(raw?.steps)) {
    throw new ApiError(502, 'MODEL_BAD_OUTPUT', '手写识别输出缺少 steps 数组')
  }

  const steps: VisionStep[] = raw.steps.map((s: any, i: number) => {
    const readable = s?.readable !== false
    const conf = num(s?.conf, readable ? 0.75 : 0.3)
    return {
      idx: i + 1,
      text: String(s?.text ?? ''),
      latex: typeof s?.latex === 'string' && s.latex.trim() ? s.latex : null,
      bbox: bboxOf(s?.bbox),
      readable,
      conf,
      status: !readable ? 'unreadable' : conf < 0.6 ? 'conflict' : 'verified',
    }
  })

  const removed_marks: RemovedMark[] = Array.isArray(raw?.removed_marks)
    ? raw.removed_marks.map((r: any, i: number) => ({
        idx: i + 1,
        reason: r?.reason === 'draft' || r?.reason === 'margin' ? r.reason : 'crossed_out',
        text: String(r?.text ?? ''),
        bbox: bboxOf(r?.bbox),
      }))
    : []

  return { steps, removed_marks }
}

export async function liveReason(input: {
  stemText: string
  timeoutMs: number
}): Promise<{
  solution: { method: string; nodes: SolutionNode[]; answer: string }
  derivation: { text: string; latex: string | null }[]
}> {
  const content = await postChat(
    env.siliconflow.baseUrl,
    env.siliconflow.keyDeepseek,
    {
      model: env.siliconflow.modelDeepseek,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            '你是高中数学解题助手。只根据题目已知条件作答；证据不足时把 confidence 设为 0.3 并在 basis 说明缺什么，禁止编造条件。' +
            JSON_ONLY,
        },
        {
          role: 'user',
          content:
            `题目：${input.stemText}\n\n按此 schema 输出：{"method":"","answer":"LaTeX","nodes":[{"node_id":"n1","goal":"",` +
            '"formula":"LaTeX","depends_on":[],"common_errors":["概念误用"]}],"derivation":[{"text":"","latex":""}],' +
            '"confidence":0.8,"basis":""}。nodes 3-7 个，common_errors 只能取：' +
            ERROR_LABELS.join('、') +
            '。',
        },
      ],
    },
    input.timeoutMs,
  )

  const raw = parseJsonObject(content)
  if (!Array.isArray(raw?.nodes) || raw.nodes.length < 1) {
    throw new ApiError(502, 'MODEL_BAD_OUTPUT', '解题输出缺少 nodes')
  }

  const nodes: SolutionNode[] = raw.nodes.slice(0, 7).map((n: any, i: number) => ({
    node_id: String(n?.node_id ?? `n${i + 1}`),
    goal: String(n?.goal ?? ''),
    formula: String(n?.formula ?? ''),
    depends_on: Array.isArray(n?.depends_on) ? n.depends_on.map(String) : [],
    common_errors: Array.isArray(n?.common_errors)
      ? n.common_errors.filter((x: string) => (ERROR_LABELS as string[]).includes(x)).slice(0, 2)
      : [],
  }))
  nodes.forEach((n) => {
    if (!n.common_errors.length) n.common_errors = ['跳步'] as ErrorLabel[]
  })

  return {
    solution: {
      method: String(raw?.method ?? '模型独立解答'),
      nodes,
      answer: String(raw?.answer ?? ''),
    },
    derivation: Array.isArray(raw?.derivation)
      ? raw.derivation.map((d: any) => ({
          text: String(d?.text ?? ''),
          latex: typeof d?.latex === 'string' ? d.latex : null,
        }))
      : [],
  }
}

/** 轻量探活：只发 1 token 的请求，用于「模型连接」自检，不产生实质费用 */
export async function probeChat(
  baseUrl: string,
  key: string,
  model: string,
  timeoutMs = 12000,
): Promise<{ ok: boolean; status?: number; error?: string; ms: number }> {
  const started = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        temperature: 0,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: ctrl.signal,
    })
    const ms = Date.now() - started
    if (res.ok) return { ok: true, ms }
    let detail = ''
    try {
      const j: any = await res.json()
      detail = j?.error?.message ?? j?.message ?? ''
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status, error: detail || `HTTP ${res.status}`, ms }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? (e.name === 'AbortError' ? '请求超时' : e.message) : '网络异常',
      ms: Date.now() - started,
    }
  } finally {
    clearTimeout(timer)
  }
}
