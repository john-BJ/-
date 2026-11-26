import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = path.dirname(fileURLToPath(import.meta.url)) // apps/server/src
export const APP_ROOT = path.resolve(here, '../../..') // app/
export const SERVER_ROOT = path.resolve(here, '..') // apps/server

// 密钥只从服务端 .env / 环境变量读取，禁止出现在前端与日志（§2.2 / §10.1）
dotenv.config({ path: path.join(APP_ROOT, '.env') })

function str(v: string | undefined, fallback = ''): string {
  return (v ?? fallback).trim()
}

export const env = {
  port: Number(str(process.env.PORT, '8787')),
  host: str(process.env.HOST, '127.0.0.1'),
  dataDir: path.resolve(APP_ROOT, str(process.env.DATA_DIR, 'data')),
  jwtSecret: str(process.env.JWT_SECRET) || 'dev-only-insecure-secret-please-change',
  providerMode: (str(process.env.PROVIDER_MODE, 'auto') || 'auto') as 'auto' | 'mock' | 'live',
  llmTimeoutSec: Number(str(process.env.LLM_TIMEOUT_SEC, '120')) || 120,
  modelExamPolicy: str(process.env.MODEL_EXAM_POLICY, 'block'),

  siliconflow: {
    baseUrl: str(process.env.SILICONFLOW_BASE_URL, 'https://api.siliconflow.cn/v1'),
    keyOcr: str(process.env.SILICONFLOW_KEY_OCR),
    keyDeepseek: str(process.env.SILICONFLOW_KEY_DEEPSEEK),
    modelOcr: str(process.env.MODEL_OCR, 'PaddlePaddle/PaddleOCR-VL-1.5'),
    modelDeepseek: str(process.env.MODEL_DEEPSEEK, 'deepseek-ai/DeepSeek-V4.1-Flash'),
  },
  zhipu: {
    baseUrl: str(process.env.ZHIPU_BASE_URL, 'https://open.bigmodel.cn/api/paas/v4'),
    keyGlm: str(process.env.ZHIPU_KEY_GLM),
    modelGlm: str(process.env.MODEL_GLM, 'GLM-5.3-Flash'),
  },
}

/** 三把密钥齐备才算 live 可用；否则自动降级为 mock，并在 UI 明示（不允许静默伪装真实识别） */
export const liveReady = Boolean(
  env.siliconflow.keyOcr && env.zhipu.keyGlm && env.siliconflow.keyDeepseek,
)

export const effectiveMode: 'mock' | 'live' =
  env.providerMode === 'auto' ? (liveReady ? 'live' : 'mock') : env.providerMode

export function ensureDirs() {
  for (const d of ['', 'uploads', 'tasks', 'samples']) {
    fs.mkdirSync(path.join(env.dataDir, d), { recursive: true })
  }
}

export const UPLOAD_DIR = path.join(env.dataDir, 'uploads')
export const PUBLIC_SAMPLE_DIR = path.join(SERVER_ROOT, 'public', 'samples')
