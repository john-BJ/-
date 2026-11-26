import { useState } from 'react'
import type { FlowApi } from '../store/useFlow'
import { api } from '../lib/api'
import { Tex } from '../components/Tex'
import { Badge, Banner, ConfidenceMeter, PanelHead, Spinner } from '../components/ui'
import type { GradeResult } from '../lib/types'

export function GradeView({ flow }: { flow: FlowApi }) {
  const { state } = flow
  const grade = state.grade as GradeResult
  const locate = state.locate
  const [derivation, setDerivation] = useState<{ text: string; latex: string | null }[] | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [note, setNote] = useState(grade.student_free_note ?? '')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')

  const el = grade.error_localization
  const isCorrect = grade.overall === 'correct'
  const lowConf = grade.meta.low_confidence

  async function unlock() {
    setUnlocking(true)
    try {
      const res = await api.derivation(grade.task_id)
      setDerivation(res.derivation)
    } catch {
      setDerivation([])
    } finally {
      setUnlocking(false)
    }
  }

  async function saveNote() {
    setSaving('saving')
    try {
      await api.saveNote(grade.task_id, note)
      setSaving('saved')
      setTimeout(() => setSaving('idle'), 1800)
    } catch {
      setSaving('idle')
    }
  }

  return (
    <>
      <div className="meta-strip">
        <Badge tone="ok">已确认 v{state.confirm?.version ?? 1}</Badge>
        <span className="mono">
          {state.confirm ? new Date(state.confirm.confirmed_at).toLocaleString('zh-CN') : ''}
        </span>
        <Badge tone={locate?.hit ? 'info' : 'warn'}>
          {locate?.hit ? `题库命中 · ${locate.question_id}` : '题库未命中 · 模型独立解答'}
        </Badge>
        {grade.provenance.source_type === 'model_solution' && <Badge tone="warn">非题库原题</Badge>}
      </div>

      {!locate?.hit && (
        <Banner tone="warn">
          <strong>未检索到原题，以下为模型独立解答</strong>
          {locate?.meta.notice && <div style={{ marginTop: 2 }}>{locate.meta.notice}</div>}
          <div className="hint" style={{ marginTop: 4 }}>
            该结论仅作参考，未与任何题库原文互校；如与老师讲法不一致，以课堂为准。
          </div>
        </Banner>
      )}

      {lowConf && (
        <Banner tone="warn">
          本次批改置信度偏低（{Math.round(el.confidence * 100)}%），首错步与主标签仅供参考。
          <div className="hint" style={{ marginTop: 2 }}>依据：{el.basis}</div>
        </Banner>
      )}

      <div className="grade-grid">
        <div className="stack">
          <div className="answer-card">
            <div className="label">正确答案</div>
            <div className="answer-body">
              <Tex latex={grade.answer_latex} display />
            </div>
            <div className="method-line">
              <span style={{ color: 'var(--ink-3)' }}>方法</span>
              <strong>{grade.method}</strong>
            </div>
          </div>

          <section className="panel">
            <PanelHead
              eyebrow="Skeleton"
              title={`关键步骤骨架（${grade.skeleton.length} 步）`}
              sub="只看骨架，先自己回想细节"
            />
            <ol className="skeleton-list">
              {grade.skeleton.map((s, i) => {
                const bad = grade.node_judgement[i]?.verdict !== 'correct'
                return (
                  <li key={s.idx} className={`skeleton-item${bad ? ' bad' : ''}`}>
                    <span className="sk-no">{s.idx}</span>
                    <div>
                      <div className="sk-goal">{s.goal}</div>
                      <div className="sk-formula">
                        <Tex latex={s.formula} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          {locate && (
            <section className="panel">
              <PanelHead eyebrow="Provenance" title="溯源与知识点" sub={locate.source.license_note} />
              <div className="row" style={{ gap: 6 }}>
                {locate.knowledge_points.map((k) => (
                  <Badge key={k} tone="neutral">
                    {k}
                  </Badge>
                ))}
                {locate.knowledge_points.length === 0 && (
                  <span className="hint">未命中题库，暂无知识点标注</span>
                )}
              </div>
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>题目来源</dt>
                <dd>
                  {locate.hit ? `自建题库 · ${locate.question_id}` : '模型独立解答（未与原题互校）'}
                </dd>
                <dt>检索得分</dt>
                <dd className="mono">{locate.meta.score.toFixed(3)}</dd>
                <dt>双路互校</dt>
                <dd className="hint">{locate.meta.dual_retrieval.reason}</dd>
              </dl>
            </section>
          )}
        </div>

        <div className="stack">
          <section className={`error-card${isCorrect ? ' correct' : ''}`}>
            <div className="error-head">
              <span className="eyebrow" style={{ color: isCorrect ? 'var(--ok)' : 'var(--err)' }}>
                {isCorrect ? 'Result' : 'First Error'}
              </span>
              <h3 style={{ fontSize: 16 }}>{isCorrect ? '这道题全对' : '首错步'}</h3>
              {grade.error_localization.primary_label && (
                <Badge tone="err">{el.primary_label}</Badge>
              )}
              {grade.secondary_errors.length > 0 && (
                <Badge tone="neutral">次生错误 {grade.secondary_errors.length} 处</Badge>
              )}
              <span style={{ marginLeft: 'auto' }}>
                <ConfidenceMeter value={el.confidence} />
              </span>
            </div>

            {isCorrect ? (
              <div className="hint">{el.basis}</div>
            ) : (
              <>
                <div className="error-step">
                  <span className="k">第 {el.first_error_step} 步 · 你写的</span>
                  <div>{el.step_text}</div>
                  {el.step_latex && (
                    <div style={{ marginTop: 6 }}>
                      <Tex latex={el.step_latex} />
                    </div>
                  )}
                </div>
                <div className="error-step">
                  <span className="k">应该做的</span>
                  <div>{el.expected_action}</div>
                  {el.expected_formula && (
                    <div style={{ marginTop: 6 }}>
                      <Tex latex={el.expected_formula} />
                    </div>
                  )}
                </div>
                <div className="basis">判定依据：{el.basis}</div>
              </>
            )}

            {grade.secondary_errors.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="field-label">次生错误（首错步之后连带产生，单独标记，不计入主错点统计）</div>
                {grade.secondary_errors.map((s) => (
                  <div key={s.step} className="removed-item">
                    <span className="hint">第 {s.step} 步</span>
                    <Badge tone="warn">{s.label}</Badge>
                  </div>
                ))}
              </div>
            )}

            {el.followup_seeds.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="field-label">待追问点（后续费曼环节使用）</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {el.followup_seeds.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="panel">
            <PanelHead eyebrow="Full Solution" title="完整逐步推导" sub="默认收起" />
            {!derivation ? (
              <div className="locked-panel">
                <h3>🔒 已收起</h3>
                <p>先按上面的骨架自己推一遍，再对照完整解析，效果更好。</p>
                <button className="btn btn-primary" onClick={() => void unlock()} disabled={unlocking}>
                  {unlocking ? <Spinner /> : null}
                  {unlocking ? '加载中…' : '解锁完整解析'}
                </button>
              </div>
            ) : (
              <div className="derivation">
                {derivation.length === 0 && <div className="hint">该题暂无更细的推导内容。</div>}
                {derivation.map((d, i) => (
                  <div key={i} className="line">
                    <span className="n">{i + 1}</span>
                    <div>
                      {d.text && <div>{d.text}</div>}
                      {d.latex && (
                        <div className="tex">
                          <Tex latex={d.latex} display />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <PanelHead title="自由补充" sub="仅本人可见 · 不参与统计" />
            <textarea
              className="field"
              rows={3}
              maxLength={500}
              value={note}
              placeholder="写点只有自己需要记住的：当时怎么想的、老师怎么说的…"
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => void saveNote()} disabled={saving === 'saving'}>
                {saving === 'saving' ? '保存中…' : saving === 'saved' ? '已保存' : '保存补充'}
              </button>
              <span className="hint">不会进入任何统计口径，也不影响错因标签。</span>
            </div>
          </section>

          <section className="panel" style={{ background: 'var(--paper-2)' }}>
            <div className="panel-head" style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 15 }}>后续迭代（本轮未开放）</h2>
            </div>
            <div className="next-steps">
              <button className="btn" disabled title="⑤ 艾宾浩斯调度">
                加入复习计划
              </button>
              <button className="btn" disabled title="⑥ 费曼追问">
                开始费曼追问
              </button>
              <button className="btn" disabled title="⑦ PDF 归档">
                导出 PDF
              </button>
              <button className="btn" disabled title="同类题推荐">
                推荐同类题
              </button>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              这些入口已按范围要求置灰，功能在后续迭代实现。
            </div>
          </section>
        </div>
      </div>

      <div className="actionbar" style={{ marginTop: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="hint">
            本题闭环完成：拍照 → 双通道识别 → 确认 v{state.confirm?.version ?? 1} → 定位 → 首次批改。
          </div>
        </div>
        <button className="btn btn-primary" onClick={flow.reset}>
          再拍一道
        </button>
      </div>
    </>
  )
}
