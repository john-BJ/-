import { useState } from 'react'
import { api, type ModelsHealth, type PublicUser } from '../lib/api'
import { Modal } from './Modal'
import { Badge, Banner, Spinner } from './ui'

const STATUS_TEXT: Record<string, { tone: 'ok' | 'warn' | 'err' | 'neutral'; text: string }> = {
  ok: { tone: 'ok', text: '连通' },
  unconfigured: { tone: 'neutral', text: '未配置密钥' },
  failed: { tone: 'err', text: '连接失败' },
  mock: { tone: 'warn', text: '已配置但处于演示模式' },
}

export function SettingsPanel({
  open,
  onClose,
  user,
  onLogout,
}: {
  open: boolean
  onClose: () => void
  user: PublicUser
  onLogout: () => void
}) {
  const [health, setHealth] = useState<ModelsHealth | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function test() {
    setBusy(true)
    setError(null)
    try {
      setHealth(await api.modelsHealth())
    } catch (e) {
      setError(e instanceof Error ? e.message : '测试失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="设置" subtitle="账号、模型连接与本轮范围">
      <div className="stack" style={{ gap: 18 }}>
        <section>
          <div className="field-label">当前账号</div>
          <div className="account-card">
            <div className="avatar">{user.display_name.slice(0, 1)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{user.display_name}</div>
              <div className="hint mono" style={{ overflowWrap: 'anywhere' }}>
                {user.email}
              </div>
            </div>
            <Badge tone="neutral">数据已隔离</Badge>
          </div>
        </section>

        <section>
          <div className="spread" style={{ marginBottom: 8 }}>
            <div className="field-label" style={{ margin: 0 }}>
              模型连接（三通道）
            </div>
            <button className="btn btn-sm" onClick={() => void test()} disabled={busy}>
              {busy ? <Spinner /> : null}
              {busy ? '测试中…' : '测试连接'}
            </button>
          </div>

          {error && <Banner tone="err">{error}</Banner>}

          {!health && !error && (
            <div className="hint">
              密钥只存在服务端 <code className="mono">.env</code>，浏览器拿不到。点击「测试连接」会发一次
              1 token 的探活请求，不传输任何题目内容。
            </div>
          )}

          {health && (
            <>
              <Banner tone={health.live_ready ? 'ok' : 'warn'}>
                当前模式：<strong>{health.mode === 'live' ? '真实模型' : '演示样本'}</strong>
                {!health.live_ready && health.mode === 'mock' && '（三把密钥未配齐或 PROVIDER_MODE=mock）'}
              </Banner>
              <div className="provider-list">
                {health.providers.map((p) => {
                  const s = STATUS_TEXT[p.status] ?? STATUS_TEXT.failed
                  return (
                    <div key={p.role} className="provider-row">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13 }}>{p.label}</div>
                        <div className="hint mono" style={{ overflowWrap: 'anywhere' }}>
                          {p.model}
                        </div>
                        {p.error && <div className="hint" style={{ color: 'var(--err)' }}>{p.error}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Badge tone={s.tone}>{s.text}</Badge>
                        {p.latency_ms != null && (
                          <div className="hint mono" style={{ marginTop: 2 }}>
                            {p.latency_ms}ms
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>

        <section>
          <div className="field-label">本轮范围</div>
          <div className="hint" style={{ lineHeight: 1.8 }}>
            已实现：① 拍照上传 → ② 双通道识别 → ②b 回显确认 → ③ 题目定位 → ④ 首次批改。
            <br />
            未实现（入口已置灰）：⑤ 艾宾浩斯调度 · ⑥ 费曼追问 · ⑦ PDF 归档 · 同类题推荐。
          </div>
        </section>

        <section className="row" style={{ justifyContent: 'space-between' }}>
          <span className="hint">退出后需要重新登录，数据保留在服务端。</span>
          <button className="btn" onClick={onLogout}>
            退出登录
          </button>
        </section>
      </div>
    </Modal>
  )
}
