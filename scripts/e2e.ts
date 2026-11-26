/**
 * 端到端自检：把 ①→④ 全链路跑一遍（8 条样本），并验证两条硬约束。
 * 用法：先启动 BFF，再 `npx tsx scripts/e2e.ts`
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787'
const SAMPLES = [
  's1-exp-compare.png',
  's2-exp-equation.png',
  's3-exp-anchor.png',
  's4-exp-range.png',
  's5-log-eval.png',
  's6-log-domain.png',
  's7-log-express.png',
  's8-log-compare.png',
]

let token = ''

async function j(path: string, init: RequestInit = {}): Promise<any> {
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

async function poll(taskId: string): Promise<any> {
  for (let i = 0; i < 200; i++) {
    const { data } = await j(`/tasks/${taskId}`)
    if (data.status === 'succeeded' || data.status === 'failed') return data
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('poll timeout')
}

const results: any[] = []
let failed = 0

function check(name: string, cond: boolean, extra = '') {
  if (!cond) {
    failed++
    console.log(`  ✗ ${name} ${extra}`)
  } else {
    console.log(`  ✓ ${name}`)
  }
}

async function main() {
  const login = await j('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@cuoti.local', password: 'demo1234' }),
  })
  if (login.status !== 200) throw new Error('登录失败')
  token = login.data.access_token
  console.log('✓ 登录成功（演示账号）')

  const meta = await j('/meta')
  check('meta 返回 8 条样本', meta.data.samples.length === 8)
  check('meta 声明 is_mock', meta.data.is_mock === true)
  check('范围外功能均关闭', Object.values(meta.data.features).every((v) => v === false))

  // 硬约束 1：没有确认就批改 → 必须 409
  const bad = await j('/grade', { method: 'POST', body: JSON.stringify({ confirm_id: 'cfm_not_exist' }) })
  check('未确认直接批改被拒绝(409)', bad.status === 409, `实际 ${bad.status}`)

  for (const file of SAMPLES) {
    const sampleId = file.split('-')[0]
    console.log(`\n— ${file}`)
    const buf = await (await import('node:fs/promises')).readFile(`apps/server/public/samples/${file}`)
    const phash = Buffer.from(file).toString('hex').slice(0, 16).padEnd(16, '0')

    const form = new FormData()
    form.append('sample_id', sampleId)
    form.append('phash', phash)
    form.append('file', new Blob([buf], { type: 'image/png' }), file)

    const up = await j('/uploads', { method: 'POST', body: form })
    if (up.status !== 200) {
      check('上传成功', false, JSON.stringify(up.data))
      continue
    }

    const recTask = await j('/recognize', {
      method: 'POST',
      body: JSON.stringify({ image_id: up.data.image_id, is_exam_question: false }),
    })
    const recDone = await poll(recTask.data.task_id)
    check('识别任务成功', recDone.status === 'succeeded', recDone.error?.message ?? '')
    if (recDone.status !== 'succeeded') continue

    const rec = await j(`/recognitions/${recTask.data.task_id}`)
    check('识别结果含 bbox', rec.data.channel_vision.steps.every((s: any) => s.bbox))
    check('双通道 diff 非空', rec.data.diff.length > 0)

    const steps = rec.data.channel_vision.steps.map((s: any, i: number) => ({
      idx: i + 1,
      text: s.text,
      latex: s.latex,
      included: true,
    }))
    const conflicts = rec.data.diff.filter((d: any) => d.status === 'conflict').map((d: any) => d.step)

    // 硬约束 2：冲突未裁定 → 必须 409
    if (conflicts.length) {
      const blocked = await j('/solutions/confirm', {
        method: 'POST',
        body: JSON.stringify({
          task_id: recTask.data.task_id,
          steps,
          student_note: '',
          edits: [],
          resolved_conflicts: [],
        }),
      })
      check('冲突未裁定被拒绝(409)', blocked.status === 409, `实际 ${blocked.status}`)
    }

    const cfm = await j('/solutions/confirm', {
      method: 'POST',
      body: JSON.stringify({
        task_id: recTask.data.task_id,
        steps,
        student_note: 'e2e',
        edits: [],
        resolved_conflicts: conflicts,
      }),
    })
    check('确认产出 ConfirmedSolution', cfm.status === 200 && cfm.data.version === 1)

    const loc = await j('/locate', { method: 'POST', body: JSON.stringify({ confirm_id: cfm.data.confirm_id }) })
    check('定位接口返回', loc.status === 200)
    check('定位不提前下发推导', Array.isArray(loc.data.meta.derivation) && loc.data.meta.derivation.length === 0)
    if (!loc.data.hit) check('未命中带 notice', Boolean(loc.data.meta.notice))

    const gTask = await j('/grade', { method: 'POST', body: JSON.stringify({ confirm_id: cfm.data.confirm_id }) })
    const gDone = await poll(gTask.data.task_id)
    check('批改任务成功', gDone.status === 'succeeded', gDone.error?.message ?? '')

    const g = await j(`/gradings/${gTask.data.task_id}`)
    const r = g.data
    check('含答案/方法/骨架', Boolean(r.answer_latex) && Boolean(r.method) && r.skeleton.length >= 3)
    check('骨架 3-7 步', r.skeleton.length >= 3 && r.skeleton.length <= 7, `实际 ${r.skeleton.length}`)
    check('完整推导默认锁定', r.full_derivation_locked === true)
    check('主标签合法', r.error_localization.primary_label === null || typeof r.error_localization.primary_label === 'string')

    const dv = await j(`/gradings/${gTask.data.task_id}/derivation`)
    check('解锁接口返回推导', Array.isArray(dv.data.derivation) && dv.data.derivation.length > 0)

    results.push({
      file,
      hit: loc.data.hit,
      overall: r.overall,
      first_error_step: r.error_localization.first_error_step,
      label: r.error_localization.primary_label,
      conf: r.error_localization.confidence,
      secondary: r.secondary_errors.length,
      skeleton: r.skeleton.length,
    })
  }

  console.log('\n================ 汇总 ================')
  console.table(results)
  console.log(failed === 0 ? '\n✓ 全部断言通过' : `\n✗ ${failed} 条断言失败`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
