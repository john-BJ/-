import type { FastifyInstance } from 'fastify'
import { requireUser } from '../auth'
import { healthCheck } from '../gateway'

export default async function modelRoutes(app: FastifyInstance) {
  /** 三通道连接自检：只发 1 token 探活，不送题目内容 */
  app.get('/api/models/health', async (req) => {
    requireUser(req)
    return healthCheck()
  })
}
