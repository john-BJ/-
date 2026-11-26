/**
 * 假上游：模拟硅基流动 / 智谱的 OpenAI 兼容接口，用来验证 live 通道的
 * 请求构造、JSON 解析、指数退避重试与失败降级（不需要真实密钥）。
 *
 * 启动：npx tsx scripts/fake-upstream.ts
 * 端口：8899
 *   /v1/chat/completions                     ← 硅基流动（OCR / 推理）
 *   /api/paas/v4/chat/completions            ← 智谱（手写视觉）
 *   /_stats                                  ← 调用计数，用于断言重试
 */
import http from 'node:http'

let visionCalls = 0
let ocrCalls = 0
let reasonCalls = 0

function reply(res: http.ServerResponse, code: number, body: unknown) {
  const text = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(text)
}

function chat(content: string) {
  return { choices: [{ message: { role: 'assistant', content } }], usage: { total_tokens: 42 } }
}

const OCR_JSON = JSON.stringify({
  stem: [{ id: 'b1', type: 'stem', text: '已知 a=2^{0.3}，b=2^{0.5}，比较 a 与 b 的大小。', bbox: [60, 120, 860, 80], conf: 0.95 }],
  formulas: [{ id: 'f1', latex: '2^{0.3}<2^{0.5}', bbox: [80, 300, 780, 64], conf: 0.91 }],
  layout: { regions: [{ kind: 'stem', bbox: [60, 120, 860, 80] }] },
})

const VISION_JSON = JSON.stringify({
  steps: [
    {
      idx: 1,
      text: '因为 0.3<0.5，所以 2^{0.3}<2^{0.5}',
      latex: '2^{0.3}<2^{0.5}',
      bbox: [80, 300, 780, 64],
      readable: true,
      conf: 0.88,
      status: 'verified',
    },
    {
      idx: 2,
      text: '所以 a<b',
      latex: 'a<b',
      bbox: [80, 420, 500, 60],
      readable: true,
      conf: 0.9,
      status: 'verified',
    },
  ],
  removed_marks: [],
})

const REASON_JSON = JSON.stringify({
  method: '指数函数单调性',
  answer: 'a<b',
  nodes: [
    { node_id: 'n1', goal: '用 y=2^x 的单调性比较', formula: '2^{0.3}<2^{0.5}', depends_on: [], common_errors: ['概念误用'] },
    { node_id: 'n2', goal: '得出大小关系', formula: 'a<b', depends_on: ['n1'], common_errors: ['符号错误'] },
  ],
  derivation: [
    { text: 'y=2^x 在 R 上单调递增', latex: 'y=2^{x}\\uparrow' },
    { text: '又 0.3<0.5，所以', latex: '2^{0.3}<2^{0.5}' },
  ],
  confidence: 0.86,
  basis: '根据指数函数单调性',
})

const server = http.createServer((req, res) => {
  if (req.url === '/_stats') {
    return reply(res, 200, { ocrCalls, visionCalls, reasonCalls })
  }

  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    let payload: any = {}
    try {
      payload = JSON.parse(body || '{}')
    } catch {
      return reply(res, 400, { error: { message: 'bad json' } })
    }
    const model = String(payload.model ?? '')
    const isZhipu = req.url?.includes('/paas/v4')

    // 探活请求（max_tokens=1）直接成功，不计入重试计数
    if (payload.max_tokens === 1) {
      return reply(res, 200, chat('pong'))
    }

    if (isZhipu) {
      visionCalls++
      // 前两次返回 503，用于验证网关的指数退避重试（最多 2 次重试）
      if (visionCalls <= 2) {
        return reply(res, 503, { error: { message: 'upstream busy (simulated)' } })
      }
      return reply(res, 200, chat(VISION_JSON))
    }

    if (model.toLowerCase().includes('ocr')) {
      ocrCalls++
      return reply(res, 200, chat(OCR_JSON))
    }

    reasonCalls++
    return reply(res, 200, chat(REASON_JSON))
  })
})

server.listen(8899, '127.0.0.1', () => {
  console.log('fake upstream on http://127.0.0.1:8899')
})
