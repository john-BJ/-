import jwt from 'jsonwebtoken'
import type { FastifyRequest } from 'fastify'
import { env } from './env'
import { err } from './lib/errors'
import { hashPassword, repo } from './store/db'
import type { PublicUser } from './types'

const ACCESS_TTL = '2h'
const REFRESH_TTL = '30d'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function publicUser(u: { user_id: string; email: string; display_name: string }): PublicUser {
  return { user_id: u.user_id, email: u.email, display_name: u.display_name }
}

export function signTokens(user: PublicUser) {
  const payload = { sub: user.user_id, email: user.email, name: user.display_name, typ: 'access' }
  return {
    access_token: jwt.sign(payload, env.jwtSecret, { expiresIn: ACCESS_TTL }),
    refresh_token: jwt.sign({ sub: user.user_id, typ: 'refresh' }, env.jwtSecret, { expiresIn: REFRESH_TTL }),
    user,
  }
}

function decode(token: string, typ: 'access' | 'refresh'): { user_id: string } {
  try {
    const p = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload
    if (p.typ !== typ || typeof p.sub !== 'string') throw new Error('bad token')
    return { user_id: p.sub }
  } catch {
    throw err.unauthorized()
  }
}

export function login(email: string, password: string) {
  const user = repo.findUserByEmail(email)
  if (!user || hashPassword(password, user.password_salt) !== user.password_hash) {
    throw err.badRequest('邮箱或密码不正确', 'BAD_CREDENTIALS')
  }
  return signTokens(publicUser(user))
}

export function register(email: string, password: string, displayName: string) {
  const mail = String(email ?? '').trim()
  const name = String(displayName ?? '').trim()
  const pwd = String(password ?? '')

  if (!EMAIL_RE.test(mail)) throw err.badRequest('请输入有效的邮箱地址', 'BAD_EMAIL')
  if (pwd.length < 6) throw err.badRequest('密码至少 6 位', 'WEAK_PASSWORD')
  if (name.length > 20) throw err.badRequest('昵称最多 20 个字', 'BAD_NAME')
  if (repo.findUserByEmail(mail)) {
    throw err.badRequest('该邮箱已注册，请直接登录', 'EMAIL_TAKEN')
  }

  const user = repo.createUser({ email: mail, display_name: name, password: pwd })
  return signTokens(publicUser(user))
}

export function refresh(refreshToken: string) {
  const p = decode(refreshToken, 'refresh')
  const user = repo.findUserById(p.user_id)
  if (!user) throw err.unauthorized()
  return signTokens(publicUser(user))
}

/** 支持 Authorization: Bearer 与 ?token=（用于 <img src> 拉取原图） */
export function requireUser(req: FastifyRequest): PublicUser {
  const header = req.headers.authorization
  let token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) {
    const q = (req.query as Record<string, unknown> | undefined)?.token
    if (typeof q === 'string') token = q
  }
  if (!token) throw err.unauthorized()
  const p = decode(token, 'access')
  const user = repo.findUserById(p.user_id)
  if (!user) throw err.unauthorized()
  return publicUser(user)
}
