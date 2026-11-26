import fs from 'node:fs'
import path from 'node:path'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { APP_ROOT, PUBLIC_SAMPLE_DIR, effectiveMode, env, ensureDirs } from './env'
import { logger } from './lib/logger'
import { ApiError } from './lib/errors'
import { repo } from './store/db'
import authRoutes from './routes/auth'
import metaRoutes from './routes/meta'
import flowRoutes from './routes/flow'
import recordRoutes from './routes/records'
import modelRoutes from './routes/models'

ensureDirs()
repo.seedDemoUser()

const app = Fastify({
  logger,
  bodyLimit: 16 * 1024 * 1024,
  disableRequestLogging: true,
})

await app.register(cors, { origin: true, credentials: false })
await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 1 } })

// 演示样本图片（公开资源，不含用户数据）
await app.register(fastifyStatic, {
  root: PUBLIC_SAMPLE_DIR,
  prefix: '/samples/',
  decorateReply: false,
  cacheControl: true,
  maxAge: '1h',
})

// 构建后的前端（npm run build 之后可直接用 BFF 单进程跑通）
const webDist = path.join(APP_ROOT, 'apps/web/dist')
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
    decorateReply: false,
  })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/samples')) {
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: '接口不存在' } })
      return
    }
    reply.type('text/html').send(fs.createReadStream(path.join(webDist, 'index.html')))
  })
}

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof ApiError) {
    reply.code(error.status).send({
      error: { code: error.code, message: error.message, hint: error.hint ?? null },
    })
    return
  }
  if ((error as any).statusCode === 413) {
    reply.code(413).send({ error: { code: 'FILE_TOO_LARGE', message: '图片超过 12MB 限制' } })
    return
  }
  logger.error({ err: error }, 'unhandled error')
  reply.code(500).send({ error: { code: 'INTERNAL', message: '服务内部错误，请重试' } })
})

await app.register(authRoutes)
await app.register(metaRoutes)
await app.register(flowRoutes)
await app.register(recordRoutes)
await app.register(modelRoutes)

app.get('/api/health', async () => ({
  ok: true,
  mode: effectiveMode,
  storage: 'sqlite',
  users: repo.countUsers(),
  time: new Date().toISOString(),
}))

app
  .listen({ port: env.port, host: env.host })
  .then(() => {
    logger.info(
      { port: env.port, mode: effectiveMode, data: env.dataDir },
      '错题本 MVP BFF 已启动',
    )
  })
  .catch((e) => {
    logger.error({ err: e }, '启动失败')
    process.exit(1)
  })

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    repo.close()
    app.close().finally(() => process.exit(0))
  })
}
