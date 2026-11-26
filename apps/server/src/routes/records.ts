import type { FastifyInstance } from 'fastify'
import { requireUser } from '../auth'
import { repo } from '../store/db'
import { ERROR_LABELS } from '../types'

export default async function recordRoutes(app: FastifyInstance) {
  /** 我的错题：按错因标签/结果筛选（标签来自锁定七类，多选筛选不等于单题多标签） */
  app.get('/api/records', async (req) => {
    const user = requireUser(req)
    const q = (req.query ?? {}) as { labels?: string; overall?: string; limit?: string }

    const labels = String(q.labels ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => (ERROR_LABELS as string[]).includes(s))
    const overall = ['correct', 'partial', 'wrong', 'unjudged'].includes(String(q.overall))
      ? String(q.overall)
      : undefined
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 50) || 50))

    const items = repo.listGradings(user.user_id, { labels, overall, limit })
    const labelStats = repo.labelCounts(user.user_id)
    const overallStats = repo.overallCounts(user.user_id)
    const total = overallStats.reduce((a, b) => a + b.count, 0)

    return {
      items,
      total,
      label_stats: ERROR_LABELS.map((label) => ({
        label,
        count: labelStats.find((s) => s.label === label)?.count ?? 0,
      })),
      overall_stats: overallStats,
      filters: { labels, overall: overall ?? null, limit },
    }
  })

  /** 单条记录详情：直接复用批改结果接口，这里只做存在性校验 */
  app.get('/api/records/:task_id', async (req) => {
    const user = requireUser(req)
    const { task_id } = req.params as { task_id: string }
    const g = repo.getGrading(task_id)
    if (!g || g.owner_id !== user.user_id) {
      const { err } = await import('../lib/errors')
      throw err.notFound('记录')
    }
    const note = repo.getNote(task_id)
    return { ...g.result, student_free_note: note?.note ?? '', created_at: g.created_at, confirm_id: g.confirm_id }
  })
}
