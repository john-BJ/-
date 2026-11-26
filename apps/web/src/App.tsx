import { useEffect, useRef, useState } from 'react'
import { logout, restoreSession, type PublicUser } from './lib/api'
import { useFlow } from './store/useFlow'
import { LoginView } from './pages/LoginView'
import { UploadView } from './pages/UploadView'
import { RecognizeView } from './pages/RecognizeView'
import { ConfirmView } from './pages/ConfirmView'
import { GradeView } from './pages/GradeView'
import { BankView } from './pages/BankView'
import { RecordsView } from './pages/RecordsView'
import { SettingsPanel } from './components/SettingsPanel'
import { Banner, Spinner, Stepper } from './components/ui'

const STEPS = ['拍照上传', '双通道识别', '回显确认', '首次批改']
type View = 'flow' | 'records' | 'bank'

export default function App() {
  const flow = useFlow()
  const { state } = flow
  const [user, setUser] = useState<PublicUser | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>('flow')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    restoreSession()
      .then((u) => setUser(u))
      .finally(() => setReady(true))
    // meta 是公开信息（模式/样本/题库规模），登录前就要显示当前是演示还是真实模型
    void flow.bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleLogout() {
    logout()
    flow.reset()
    setUser(null)
    setSettingsOpen(false)
    setView('flow')
  }

  const stepIndex =
    state.phase === 'upload'
      ? 0
      : state.phase === 'recognizing'
        ? 1
        : state.phase === 'confirming'
          ? 2
          : state.phase === 'grading' || state.phase === 'graded'
            ? 3
            : 0

  if (!ready) {
    return (
      <div className="boot-screen">
        <Spinner /> <span className="hint">正在连接服务端…</span>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">错</span>
            <div className="brand-text">
              <h1>错题本 · 费曼融合</h1>
              <p>首次错题闭环 MVP</p>
            </div>
          </div>
          <span className={`mode-chip${state.meta?.is_mock ? '' : ' live'}`} style={{ marginLeft: 'auto' }}>
            <i className="dot" />
            {state.meta ? (state.meta.is_mock ? '演示模式' : '真实模型') : '连接中'}
          </span>
        </header>
        <main className="shell">
          <LoginView onAuthed={setUser} />
        </main>
        <footer className="footnote">
          本轮范围：①拍照 → ②双通道识别 → ②b回显确认 → ③题目定位 → ④首次批改。
        </footer>
      </>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">错</span>
          <div className="brand-text">
            <h1>错题本 · 费曼融合</h1>
            <p>首次错题闭环 MVP</p>
          </div>
        </div>

        <nav className="tabs" role="tablist">
          <button aria-selected={view === 'flow'} onClick={() => setView('flow')}>
            批改台
          </button>
          <button aria-selected={view === 'records'} onClick={() => setView('records')}>
            我的错题
          </button>
          <button aria-selected={view === 'bank'} onClick={() => setView('bank')}>
            知识脉络
          </button>
        </nav>

        <span className={`mode-chip${state.meta?.is_mock ? '' : ' live'}`} title={state.meta?.mode.provider}>
          <i className="dot" />
          {state.meta ? (state.meta.is_mock ? '演示模式' : '真实模型') : '连接中'}
        </span>

        <button className="user-chip" onClick={() => setSettingsOpen(true)} title="账号与设置">
          <span className="avatar-sm">{user.display_name.slice(0, 1)}</span>
          <span className="user-name">{user.display_name}</span>
        </button>
      </header>

      <main className="shell">
        {state.sessionError && (
          <Banner tone="err">
            服务端连接失败：{state.sessionError}
            <div className="hint" style={{ marginTop: 4 }}>
              请确认 BFF 已启动（<code className="mono">npm run dev</code>），并检查 .env 配置。
            </div>
          </Banner>
        )}

        {view === 'bank' && <BankView />}
        {view === 'records' && <RecordsView />}

        {view === 'flow' && (
          <>
            <Stepper steps={STEPS} current={stepIndex} />

            {state.phase === 'boot' && (
              <div className="panel" style={{ textAlign: 'center', padding: 60 }}>
                <Spinner /> <span className="hint">正在加载…</span>
              </div>
            )}

            {state.phase === 'upload' && <UploadView flow={flow} />}
            {state.phase === 'recognizing' && <RecognizeView flow={flow} />}

            {state.phase === 'grading' && (
              <div className="panel progress-wrap" style={{ textAlign: 'center' }}>
                <div className="progress-hero">
                  <div className="eyebrow">Grading</div>
                  <h2>批改中</h2>
                  <p>{state.stageText || '正在处理'}</p>
                </div>
                <div className="bar">
                  <i style={{ width: `${state.task?.progress ?? 20}%` }} />
                </div>
                <div className="hint">
                  <Spinner /> 已确认 v{state.confirm?.version ?? 1}，正在做题库检索与错因定位
                </div>
              </div>
            )}

            {state.phase === 'confirming' && <ConfirmView flow={flow} />}
            {state.phase === 'graded' && state.grade && <GradeView flow={flow} />}
          </>
        )}
      </main>

      <footer className="footnote">
        本轮范围：①拍照 → ②双通道识别 → ②b回显确认 → ③题目定位 → ④首次批改。
        复习调度 / 费曼追问 / PDF 归档 / 同类题推荐 为后续迭代。
      </footer>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        onLogout={handleLogout}
      />
    </div>
  )
}
