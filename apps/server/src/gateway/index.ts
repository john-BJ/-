import { effectiveMode, env } from '../env'
import { ApiError } from '../lib/errors'
import { logger } from '../lib/logger'
import { sleep } from '../lib/util'
import type { SolutionNode } from '../types'
import { liveOcr, liveReason, liveVision, probeChat } from './live'
import { mockOcr, mockReasonSolution, mockVision, sampleOf, type OcrOutput, type VisionOutput } from './mock'

export type Role = 'ocr' | 'vision' | 'reason'

export interface CallTrace {
  role: string
  model: string
  ms: number
}

export interface CallInput {
  imageBase64?: string
  mime?: string
  sampleId?: string | null
  stemText?: string
  /** 真题/考试原卷标记：命中则拒绝送往生成式模型（§4 硬口径） */
  isExamQuestion?: boolean
}

const RETRY_MAX = 2 // 首次 + 最多 2 次重试（§12.2）
const RETRY_BASE_MS = 600

function retryable(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false
  return e.code === 'MODEL_UPSTREAM_BUSY' || e.code === 'MODEL_UPSTREAM_ERROR' || e.code === 'MODEL_EMPTY_OUTPUT'
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!retryable(e) || attempt === RETRY_MAX) break
      const wait = RETRY_BASE_MS * 2 ** attempt
      logger.warn({ label, attempt: attempt + 1, wait, code: (e as ApiError).code }, '模型调用失败，指数退避重试')
      await sleep(wait)
    }
  }
  throw lastErr
}

/**
 * 统一网关：所有模型调用必须经过这里。
 * 职责：模式路由（mock/live）、内容合规闸门、超时、重试、耗时埋点、日志脱敏。
 */
export async function call<T>(role: Role, input: CallInput, trace: CallTrace[] = []): Promise<T> {
  if (
    role !== 'ocr' &&
    input.isExamQuestion &&
    env.modelExamPolicy === 'block' &&
    effectiveMode === 'live'
  ) {
    throw new ApiError(
      451,
      'MODEL_EXAM_BLOCKED',
      '该题被标记为真题/考试原卷，按硬口径不送往生成式模型',
      '请取消「真题」标记后再试，或改用人工录入',
    )
  }

  const started = Date.now()
  const model =
    effectiveMode === 'mock'
      ? `mock:${role}`
      : role === 'ocr'
        ? env.siliconflow.modelOcr
        : role === 'vision'
          ? env.zhipu.modelGlm
          : env.siliconflow.modelDeepseek

  try {
    if (effectiveMode === 'mock') {
      // mock 也走同一调度骨架，只是把等待时间模拟成真实量级，便于前端验证轮询与进度
      await sleep(role === 'vision' ? 1200 : role === 'ocr' ? 900 : 700)
      if (role === 'ocr') {
        const s = sampleOf(input.sampleId)
        if (!s) throw new ApiError(400, 'MOCK_SAMPLE_REQUIRED', '当前为演示模式，未绑定样本', '从右侧选一张演示样本，或在 .env 配置三把模型密钥后重启服务')
        return mockOcr(s) as unknown as T
      }
      if (role === 'vision') {
        const s = sampleOf(input.sampleId)
        if (!s) throw new ApiError(400, 'MOCK_SAMPLE_REQUIRED', '当前为演示模式，未绑定样本', '从右侧选一张演示样本，或在 .env 配置三把模型密钥后重启服务')
        return mockVision(s) as unknown as T
      }
      const s = sampleOf(input.sampleId)
      if (!s) throw new ApiError(400, 'MOCK_SAMPLE_REQUIRED', '当前为演示模式，未绑定样本', '从右侧选一张演示样本，或在 .env 配置三把模型密钥后重启服务')
      const r = mockReasonSolution(s.sample_id)
      return {
        solution: r.solution,
        derivation: r.derivation,
        nodes: r.nodes as SolutionNode[],
      } as unknown as T
    }

    if (role === 'ocr') {
      if (!input.imageBase64 || !input.mime) throw new ApiError(400, 'MISSING_IMAGE', '缺少图片数据')
      return (await withRetry(
        () => liveOcr({ imageBase64: input.imageBase64!, mime: input.mime!, timeoutMs: env.llmTimeoutSec * 1000 }),
        'ocr',
      )) as unknown as T
    }
    if (role === 'vision') {
      if (!input.imageBase64 || !input.mime) throw new ApiError(400, 'MISSING_IMAGE', '缺少图片数据')
      return (await withRetry(
        () => liveVision({ imageBase64: input.imageBase64!, mime: input.mime!, timeoutMs: env.llmTimeoutSec * 1000 }),
        'vision',
      )) as unknown as T
    }
    if (!input.stemText) throw new ApiError(400, 'MISSING_STEM', '缺少题干文本')
    return (await withRetry(
      () => liveReason({ stemText: input.stemText!, timeoutMs: env.llmTimeoutSec * 1000 }),
      'reason',
    )) as unknown as T
  } finally {
    const ms = Date.now() - started
    trace.push({ role, model, ms })
    // 只记录元数据，不记录题干/图片内容（§10.1 日志脱敏）
    logger.info({ role, model, ms, mode: effectiveMode }, 'gateway.call')
  }
}

export function gatewayMode() {
  return {
    mode: effectiveMode,
    provider: effectiveMode === 'mock' ? 'mock（未配置密钥，使用 8 条标注样本）' : 'live',
    models: {
      ocr: effectiveMode === 'mock' ? 'mock:ocr' : env.siliconflow.modelOcr,
      vision: effectiveMode === 'mock' ? 'mock:vision' : env.zhipu.modelGlm,
      reason: effectiveMode === 'mock' ? 'mock:reason' : env.siliconflow.modelDeepseek,
    },
  }
}

export type { OcrOutput, VisionOutput }

export interface ProviderHealth {
  role: Role
  label: string
  model: string
  configured: boolean
  status: 'ok' | 'unconfigured' | 'failed' | 'mock'
  latency_ms?: number
  error?: string
}

/**
 * 三通道连接自检。只发 1 token 的探活请求，不会把任何题目内容送出去。
 * 在 mock 模式下明确返回 unconfigured，避免把「演示」伪装成「已接真模型」。
 */
export async function healthCheck(): Promise<{
  mode: 'mock' | 'live'
  live_ready: boolean
  providers: ProviderHealth[]
  checked_at: string
}> {
  const defs: { role: Role; label: string; baseUrl: string; key: string; model: string }[] = [
    {
      role: 'ocr',
      label: '硅基流动 · 版面/公式 OCR',
      baseUrl: env.siliconflow.baseUrl,
      key: env.siliconflow.keyOcr,
      model: env.siliconflow.modelOcr,
    },
    {
      role: 'vision',
      label: '智谱 · 手写识别',
      baseUrl: env.zhipu.baseUrl,
      key: env.zhipu.keyGlm,
      model: env.zhipu.modelGlm,
    },
    {
      role: 'reason',
      label: '硅基流动 · 解题推理',
      baseUrl: env.siliconflow.baseUrl,
      key: env.siliconflow.keyDeepseek,
      model: env.siliconflow.modelDeepseek,
    },
  ]

  const providers: ProviderHealth[] = await Promise.all(
    defs.map(async (d) => {
      if (!d.key) {
        return { role: d.role, label: d.label, model: d.model, configured: false, status: 'unconfigured' as const }
      }
      if (effectiveMode === 'mock') {
        return {
          role: d.role,
          label: d.label,
          model: d.model,
          configured: true,
          status: 'mock' as const,
          error: 'PROVIDER_MODE=mock，已配置但未启用',
        }
      }
      const r = await probeChat(d.baseUrl, d.key, d.model)
      return {
        role: d.role,
        label: d.label,
        model: d.model,
        configured: true,
        status: r.ok ? ('ok' as const) : ('failed' as const),
        latency_ms: r.ms,
        error: r.error,
      }
    }),
  )

  return {
    mode: effectiveMode,
    live_ready: effectiveMode === 'live' && providers.every((p) => p.status === 'ok'),
    providers,
    checked_at: new Date().toISOString(),
  }
}
