import { useEffect, useState } from 'react'
import { api, ApiError, loginDemo, loginWithPassword, registerAccount, type PublicUser } from '../lib/api'
import type { Meta } from '../lib/types'
import { Banner, Spinner } from '../components/ui'

type Mode = 'login' | 'register'

export function LoginView({ onAuthed }: { onAuthed: (u: PublicUser) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'form' | 'demo' | null>(null)
  const [error, setError] = useState<{ msg: string; hint?: string } | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)

  useEffect(() => {
    api
      .meta()
      .then(setMeta)
      .catch(() => undefined)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy('form')
    try {
      const user =
        mode === 'login'
          ? await loginWithPassword(email.trim(), password)
          : await registerAccount(email.trim(), password, name)
      onAuthed(user)
    } catch (err) {
      const e2 = err as ApiError
      setError({ msg: e2.message ?? '操作失败', hint: e2.hint })
    } finally {
      setBusy(null)
    }
  }

  async function demo() {
    setError(null)
    setBusy('demo')
    try {
      onAuthed(await loginDemo())
    } catch (err) {
      setError({ msg: (err as ApiError).message ?? '演示账号登录失败' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="auth-wrap">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">错</span>
          <div>
            <h1>错题本 · 费曼融合</h1>
            <p className="hint">首次错题闭环 MVP</p>
          </div>
        </div>

        <div className="seg auth-seg">
          <button aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
            登录
          </button>
          <button aria-pressed={mode === 'register'} onClick={() => setMode('register')}>
            注册
          </button>
        </div>

        {error && (
          <Banner tone="err">
            {error.msg}
            {error.hint && <div className="hint" style={{ marginTop: 4 }}>{error.hint}</div>}
          </Banner>
        )}

        <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
          {mode === 'register' && (
            <label className="field-block">
              <span className="field-label">昵称（可选）</span>
              <input
                className="field"
                value={name}
                maxLength={20}
                placeholder="怎么称呼你"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="field-block">
            <span className="field-label">邮箱</span>
            <input
              className="field"
              type="email"
              autoComplete="email"
              required
              value={email}
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field-block">
            <span className="field-label">密码</span>
            <input
              className="field"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              placeholder="至少 6 位"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className="btn btn-primary btn-lg btn-block" disabled={busy !== null} type="submit">
            {busy === 'form' ? <Spinner /> : null}
            {mode === 'login' ? '登录' : '创建账号'}
          </button>
        </form>

        <div className="auth-divider">
          <span>或</span>
        </div>

        <button className="btn btn-block" onClick={() => void demo()} disabled={busy !== null}>
          {busy === 'demo' ? <Spinner /> : null}
          用演示账号体验（demo@cuoti.local）
        </button>

        <p className="hint" style={{ marginTop: 14, lineHeight: 1.7 }}>
          每个账号的错题、确认结果、批改记录互相隔离。演示账号里预置了 8 条标注样本，
          登录后点「演示样本」即可跑通全流程。
        </p>
      </section>

      <aside className="auth-side">
        <div className="eyebrow">What you get</div>
        <h2>一道错题，四步走完</h2>
        <ol className="auth-steps">
          <li>
            <b>① 拍照上传</b>
            <span>EXIF 校正、降采样、感知哈希去重后归档</span>
          </li>
          <li>
            <b>② 双通道识别</b>
            <span>PaddleOCR-VL 读印刷题干与公式，GLM-5.3-Flash 读手写过程</span>
          </li>
          <li>
            <b>②b 回显确认</b>
            <span>左图右文逐条核对，冲突必须裁定，确认后才生效</span>
          </li>
          <li>
            <b>③④ 定位与批改</b>
            <span>题库优先，未命中走模型自解并明确标注</span>
          </li>
        </ol>
        <div className="auth-note">
          <div className="row" style={{ gap: 8 }}>
            <span className={`mode-chip${meta?.is_mock ? '' : ' live'}`}>
              <i className="dot" />
              {meta ? (meta.is_mock ? '演示模式' : '真实模型') : '连接中'}
            </span>
            <span className="hint">数据库：SQLite · 多用户隔离</span>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            本轮范围只到「首次批改」，复习调度、费曼追问、PDF 归档均未开放。
          </p>
        </div>
      </aside>
    </div>
  )
}
