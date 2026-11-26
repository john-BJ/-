import type { FastifyInstance } from 'fastify'
import { SAMPLES } from '../bank/samples'
import { QUESTIONS } from '../bank/questions'
import { GRAPHS } from '../bank/graph'
import { gatewayMode } from '../gateway'
import { ERROR_LABELS } from '../types'
import { effectiveMode } from '../env'

export default async function metaRoutes(app: FastifyInstance) {
  app.get('/api/meta', async () => ({
    mode: gatewayMode(),
    is_mock: effectiveMode === 'mock',
    error_labels: ERROR_LABELS,
    samples: SAMPLES.map((s) => ({
      sample_id: s.sample_id,
      title: s.title,
      tag: s.tag,
      image_url: `/samples/${s.image_file}`,
      question_id: s.question_id,
    })),
    bank: {
      math_questions: QUESTIONS.length,
      exponential: QUESTIONS.filter((q) => q.topic === 'exponential').length,
      logarithm: QUESTIONS.filter((q) => q.topic === 'logarithm').length,
    },
    /** 范围外功能显式声明关闭，前端据此置灰入口 */
    features: {
      review_scheduling: false,
      feynman_followup: false,
      pdf_archive: false,
      similar_questions: false,
    },
  }))

  app.get('/api/bank/graph', async (req) => {
    const subject = ((req.query as any)?.subject ?? 'math') as 'math' | 'physics'
    const graph = GRAPHS[subject]
    if (!graph) return { error: 'unknown subject' }
    return graph
  })

  app.get('/api/bank/questions', async (req) => {
    const topic = (req.query as any)?.topic as string | undefined
    const list = topic ? QUESTIONS.filter((q) => q.topic === topic) : QUESTIONS
    return { total: list.length, items: list }
  })
}
