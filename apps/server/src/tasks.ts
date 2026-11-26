import { ApiError } from './lib/errors'
import { logger } from './lib/logger'
import { newId, nowIso } from './lib/util'
import { repo } from './store/db'
import type { TaskState } from './types'

export interface TaskCtx {
  task_id: string
  setStage: (stage: string, progress: number) => void
}

function toErrorPayload(e: unknown): NonNullable<TaskState['error']> {
  if (e instanceof ApiError) return { code: e.code, message: e.message, hint: e.hint }
  const msg = e instanceof Error ? e.message : String(e)
  return { code: 'INTERNAL', message: '处理失败，请重试', hint: msg.slice(0, 160) }
}

/**
 * 异步长任务骨架（§12.4）：提交后立即返回 task_id，前端轮询进度，不做同步阻塞。
 * LLM 单次超时由网关控制（默认 120s）。
 */
export function startTask(
  kind: TaskState['kind'],
  ownerId: string,
  work: (ctx: TaskCtx) => Promise<void>,
): TaskState {
  const task: TaskState = {
    task_id: newId('task'),
    kind,
    owner_id: ownerId,
    status: 'queued',
    stage: '排队中',
    progress: 0,
    error: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    usage: { calls: [], total_ms: 0 },
  }
  repo.upsertTask(task)

  const started = Date.now()
  const ctx: TaskCtx = {
    task_id: task.task_id,
    setStage(stage, progress) {
      task.stage = stage
      task.progress = Math.max(task.progress, Math.min(99, progress))
      task.updated_at = nowIso()
      repo.upsertTask(task)
    },
  }

  // 故意不 await：调用方拿到的就是「已受理」的任务句柄
  void (async () => {
    try {
      task.status = 'running'
      task.stage = '开始处理'
      task.progress = 5
      task.updated_at = nowIso()
      repo.upsertTask(task)

      await work(ctx)

      task.status = 'succeeded'
      task.stage = '完成'
      task.progress = 100
    } catch (e) {
      task.status = 'failed'
      task.stage = '失败'
      const payload = toErrorPayload(e)
      task.error = payload
      logger.error(
        { task_id: task.task_id, kind, code: payload.code, detail: payload.hint },
        'task failed',
      )
    } finally {
      task.usage.total_ms = Date.now() - started
      task.updated_at = nowIso()
      repo.upsertTask(task)
    }
  })()

  return task
}

export function publicTask(task: TaskState) {
  return {
    task_id: task.task_id,
    kind: task.kind,
    status: task.status,
    stage: task.stage,
    progress: task.progress,
    error: task.error,
    created_at: task.created_at,
    updated_at: task.updated_at,
    usage: task.usage,
  }
}
