/**
 * 多用户与数据隔离自检：
 * 1) 注册 A / B 两个账号（邮箱唯一）
 * 2) A 跑完整闭环
 * 3) B 读不到 A 的记录、图片、批改结果（全部 404）
 * 4) A 重新登录后仍能看到自己的记录
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787'
let failed = 0

function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failed++
    console.log(`  ✗ ${name} ${extra}`)
  }
}

async function j(path: string, init: RequestInit = {}, token = '') {
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

async function poll(taskId: string, token: string) {
  for (let i = 0; i < 200; i++) {
    const { data } = await j(`/tasks/${taskId}`, {}, token)
    if (data.status === 'succeeded' || data.status === 'failed') return data
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('poll timeout')
}

async function main() {
  const stamp = Date.now()
  const mailA = `alice.${stamp}@test.local`
  const mailB = `bob.${stamp}@test.local`

  // ---- 注册 ----
  const a = await j('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: mailA, password: 'pass1234', display_name: 'Alice' }),
  })
  check('A 注册成功', a.status === 200, JSON.stringify(a.data))
  check('A 拿到独立 user_id', typeof a.data.user?.user_id === 'string' && a.data.user.user_id !== 'u_demo')

  const dup = await j('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: mailA, password: 'pass1234', display_name: 'Alice2' }),
  })
  check('重复邮箱被拒绝(400)', dup.status === 400 && dup.data.error.code === 'EMAIL_TAKEN', JSON.stringify(dup.data))

  const weak = await j('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: `weak.${stamp}@test.local`, password: '123', display_name: 'W' }),
  })
  check('弱密码被拒绝(400)', weak.status === 400 && weak.data.error.code === 'WEAK_PASSWORD')

  const b = await j('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: mailB, password: 'pass1234', display_name: 'Bob' }),
  })
  check('B 注册成功', b.status === 200)
  check('A/B 的 user_id 不同', a.data.user.user_id !== b.data.user.user_id)

  const tokenA = a.data.access_token as string
  const tokenB = b.data.access_token as string

  // ---- B 初始为空 ----
  const emptyB = await j('/records', {}, tokenB)
  check('B 的记录为空', emptyB.data.total === 0, `实际 ${emptyB.data.total}`)

  // ---- A 跑闭环 ----
  const fs = await import('node:fs/promises')
  const buf = await fs.readFile('apps/server/public/samples/s1-exp-compare.png')
  const form = new FormData()
  form.append('sample_id', 's1')
  form.append('phash', `aa${stamp}`.slice(0, 16).padEnd(16, '0'))
  form.append('is_exam_question', 'false')
  form.append('file', new Blob([buf], { type: 'image/png' }), 's1.png')
  const up = await j('/uploads', { method: 'POST', body: form }, tokenA)
  check('A 上传成功', up.status === 200, JSON.stringify(up.data))

  const recTask = await j('/recognize', { method: 'POST', body: JSON.stringify({ image_id: up.data.image_id }) }, tokenA)
  const recDone = await poll(recTask.data.task_id, tokenA)
  check('A 识别成功', recDone.status === 'succeeded', JSON.stringify(recDone.error))

  const rec = await j(`/recognitions/${recTask.data.task_id}`, {}, tokenA)
  const steps = rec.data.channel_vision.steps.map((s: any, i: number) => ({
    idx: i + 1,
    text: s.text,
    latex: s.latex,
    included: true,
  }))
  const conflicts = rec.data.diff.filter((d: any) => d.status === 'conflict').map((d: any) => d.step)
  const cfm = await j(
    '/solutions/confirm',
    {
      method: 'POST',
      body: JSON.stringify({
        task_id: recTask.data.task_id,
        steps,
        student_note: '',
        edits: [],
        resolved_conflicts: conflicts,
      }),
    },
    tokenA,
  )
  check('A 确认成功', cfm.status === 200, JSON.stringify(cfm.data))

  const gTask = await j('/grade', { method: 'POST', body: JSON.stringify({ confirm_id: cfm.data.confirm_id }) }, tokenA)
  const gDone = await poll(gTask.data.task_id, tokenA)
  check('A 批改成功', gDone.status === 'succeeded', JSON.stringify(gDone.error))

  const recA = await j('/records', {}, tokenA)
  check('A 能看到自己的记录', recA.data.total >= 1, `实际 ${recA.data.total}`)

  // ---- 跨账号访问必须 404 ----
  const cross1 = await j(`/gradings/${gTask.data.task_id}`, {}, tokenB)
  check('B 读 A 的批改 → 404', cross1.status === 404, `实际 ${cross1.status}`)
  const cross2 = await j(`/recognitions/${recTask.data.task_id}`, {}, tokenB)
  check('B 读 A 的识别 → 404', cross2.status === 404, `实际 ${cross2.status}`)
  const cross3 = await j(`/images/${up.data.image_id}`, {}, tokenB)
  check('B 读 A 的原图 → 404', cross3.status === 404, `实际 ${cross3.status}`)
  const cross4 = await j(`/records/${gTask.data.task_id}`, {}, tokenB)
  check('B 读 A 的记录详情 → 404', cross4.status === 404, `实际 ${cross4.status}`)
  const cross5 = await j('/solutions/' + cfm.data.confirm_id, {}, tokenB)
  check('B 读 A 的确认结果 → 404', cross5.status === 404, `实际 ${cross5.status}`)

  // ---- A 重新登录 ----
  const relogin = await j('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: mailA, password: 'pass1234' }),
  })
  check('A 重新登录成功', relogin.status === 200)
  const again = await j('/records', {}, relogin.data.access_token)
  check('A 重新登录后记录仍在', again.data.total >= 1)

  const me = await j('/auth/me', {}, tokenA)
  check('/auth/me 返回正确账号', me.data.user.email === mailA)

  console.log(failed === 0 ? '\n✓ 多用户与隔离断言全部通过' : `\n✗ ${failed} 条断言失败`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
