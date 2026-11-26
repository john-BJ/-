import type { ReactNode } from 'react'

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  title,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'err' | 'info'
  dot?: boolean
  title?: string
}) {
  return (
    <span className={`badge badge-${tone}${dot ? ' badge-dot' : ''}`} title={title}>
      {children}
    </span>
  )
}

export function Banner({
  tone = 'info',
  icon,
  children,
}: {
  tone?: 'info' | 'warn' | 'err' | 'ok'
  icon?: string
  children: ReactNode
}) {
  const fallback = { info: 'i', warn: '!', err: '×', ok: '✓' }[tone]
  return (
    <div className={`banner banner-${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      <span className="b-icon">{icon ?? fallback}</span>
      <div>{children}</div>
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" aria-label="加载中" />
}

export function EmptyState({ icon = '◌', title, desc }: { icon?: string; title: string; desc?: string }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div>{title}</div>
      {desc && <div className="hint" style={{ marginTop: 4 }}>{desc}</div>}
    </div>
  )
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <nav className="stepper" aria-label="流程进度">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : ''
        return (
          <div key={label} style={{ display: 'contents' }}>
            <div className={`step ${state}`}>
              <span className="step-dot">{i < current ? '✓' : i + 1}</span>
              <span className="step-label">{label}</span>
            </div>
            {i < steps.length - 1 && <span className={`step-line ${i < current ? 'done' : ''}`} />}
          </div>
        )
      })}
    </nav>
  )
}

export function PanelHead({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="panel-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {sub && <span className="sub">{sub}</span>}
    </div>
  )
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const tone = pct >= 75 ? 'var(--ok)' : pct >= 55 ? 'var(--warn)' : 'var(--err)'
  return (
    <span className="conf-meter">
      <span className="meter">
        <i style={{ width: `${pct}%`, background: tone }} />
      </span>
      置信度 {pct}%
    </span>
  )
}
