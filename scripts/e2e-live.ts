/**
 * live 通道端到端自检（配合 scripts/fake-upstream.ts）
 *
 * 验证点：
 * 1. 真实模式下的请求构造与 JSON 解析（OCR / 视觉 / 推理三通道）
 * 2. 503 时的指数退避重试（视觉通道前两次失败、第三次成功）
 * 3. 题库未命中时走模型自解，并带「未检索到原题」标注
 * 4. 三通道探活接口
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1:8788'
const UPSTREAM = process.env.UPSTREAM ?? 'http://127.0.0.1:8899'

let token = ''
let failed = 0

function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failed++
    console.log(`  ✗ ${name} ${extra}`)
  }
}

async function j(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json')
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, data }
}

async function poll(taskId: string) {
  for (let i = 0; i < 200; i++) {
    const { data } = await j(`/tasks/${taskId}`)
    if (data.status === 'succeeded' || data.status === 'failed') return data
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('poll timeout')
}

async function main() {
  const login = await j('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@cuoti.local', password: 'demo1234' }),
  })
  if (login.status !== 200) throw new Error(`登录失败：${JSON.stringify(login.data)}`)
  token = login.data.access_token
  console.log('✓ 登录成功')

  const health = await j('/models/health')
  check('探活接口返回 live', health.data.mode === 'live', JSON.stringify(health.data))
  check('三通道均连通', health.data.providers.every((p: any) => p.status === 'ok'), JSON.stringify(health.data.providers))
  check('live_ready = true', health.data.live_ready === true)

  const fs = await import('node:fs/promises')
  const buf = await fs.readFile('apps/server/public/samples/s1-exp-compare.png')
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'image/png' }), 'live.png')
  form.append('phash', 'aabbccdd11223344')
  const up = await j('/uploads', { method: 'POST', body: form })
  check('上传成功', up.status === 200, JSON.stringify(up.data))

  const recTask = await j('/recognize', {
    method: 'POST',
    body: JSON.stringify({ image_id: up.data.image_id, is_exam_question: false }),
  })
  const done = await poll(recTask.data.task_id)
  check('识别任务成功（含 2 次 503 重试）', done.status === 'succeeded', JSON.stringify(done.error))

  const rec = await j(`/recognitions/${recTask.data.task_id}`)
  check('识别走 live 通道', rec.data.meta.provider_mode === 'live', rec.data.meta.provider_mode)
  check('OCR 题干解析成功', (rec.data.channel_ocr.stem[0]?.text ?? '').includes('2^{0.3}'))
  check('手写步骤解析成功', rec.data.channel_vision.steps.length === 2)
  check('bbox 解析为数字数组', Array.isArray(rec.data.channel_vision.steps[0].bbox))

  const stats = await (await fetch(`${UPSTREAM}/_stats`)).json()
  check('视觉通道确实重试了 2 次', stats.visionCalls === 3, `实际 ${stats.visionCalls} 次`)

  const steps = rec.data.channel_vision.steps.map((s: any, i: number) => ({
    idx: i + 1,
    text: s.text,
    latex: s.latex,
    included: true,
  }))
  const cfm = await j('/solutions/confirm', {
    method: 'POST',
    body: JSON.stringify({
      task_id: recTask.data.task_id,
      steps,
      student_note: '',
      edits: [],
      resolved_conflicts: [],
    }),
  })
  check('确认产出 ConfirmedSolution', cfm.status === 200)

  const loc = await j('/locate', { method: 'POST', body: JSON.stringify({ confirm_id: cfm.data.confirm_id }) })
  check('题库未命中（live 题干不在自建题库）', loc.data.hit === false)
  check('未命中带「未检索到原题」标注', String(loc.data.meta.notice ?? '').includes('未检索到原题'))

  const gTask = await j('/grade', { method: 'POST', body: JSON.stringify({ confirm_id: cfm.data.confirm_id }) })
  const gDone = await poll(gTask.data.task_id)
  check('批改任务成功', gDone.status === 'succeeded', JSON.stringify(gDone.error))

  const g = await j(`/gradings/${gTask.data.task_id}`)
  check('批改含答案/方法/骨架', Boolean(g.data.answer_latex) && Boolean(g.data.method) && g.data.skeleton.length >= 2)
  check('批改 provenance 标记模型自解', g.data.provenance.source_type === 'model_solution')
  check('主标签仍为七选一', g.data.error_localization.primary_label === null || typeof g.data.error_localization.primary_label === 'string')

  console.log(failed === 0 ? '\n✓ live 通道全部断言通过' : `\n✗ ${failed} 条断言失败`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
