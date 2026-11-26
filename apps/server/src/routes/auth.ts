import type { FastifyInstance } from 'fastify'
import { login, refresh, register, requireUser } from '../auth'
import { err } from '../lib/errors'

export default async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req) => {
    const { email, password, display_name } = (req.body ?? {}) as {
      email?: string
      password?: string
      display_name?: string
    }
    if (!email || !password) throw err.badRequest('缺少邮箱或密码', 'MISSING_FIELDS')
    return register(email, password, display_name ?? '')
  })

  app.post('/api/auth/login', async (req) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string }
    if (!email || !password) throw err.badRequest('缺少邮箱或密码', 'MISSING_FIELDS')
    return login(email, password)
  })

  app.post('/api/auth/refresh', async (req) => {
    const { refresh_token } = (req.body ?? {}) as { refresh_token?: string }
    if (!refresh_token) throw err.badRequest('缺少 refresh_token', 'MISSING_FIELDS')
    return refresh(refresh_token)
  })

  app.get('/api/auth/me', async (req) => ({ user: requireUser(req) }))
}
