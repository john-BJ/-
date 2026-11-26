import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { RichText, Tex } from '../components/Tex'
import { Badge, Banner, EmptyState, PanelHead, Spinner } from '../components/ui'
import type { Question, SubjectGraph } from '../lib/types'

type Tab = 'math' | 'physics' | 'bank'

export function BankView() {
  const [tab, setTab] = useState<Tab>('math')
  const [graph, setGraph] = useState<Record<string, SubjectGraph>>({})
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const jobs: Promise<unknown>[] = []
    if (!graph.math) {
      jobs.push(api.graph('math').then((g) => alive && setGraph((s) => ({ ...s, math: g }))))
    }
    if (!graph.physics) {
      jobs.push(api.graph('physics').then((g) => alive && setGraph((s) => ({ ...s, physics: g }))))
    }
    if (!questions) {
      jobs.push(api.questions().then((r) => alive && setQuestions(r.items)))
    }
    Promise.all(jobs)
      .catch(() => undefined)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="panel">
      <div className="bank-head">
        <PanelHead eyebrow="Knowledge" title="知识脉络与题库" sub="数学依据教材知识图谱整理" />
        <div className="seg" style={{ marginLeft: 'auto' }}>
          <button aria-pressed={tab === 'math'} onClick={() => setTab('math')}>
            数学脉络
          </button>
          <button aria-pressed={tab === 'physics'} onClick={() => setTab('physics')}>
            物理脉络
          </button>
          <button aria-pressed={tab === 'bank'} onClick={() => setTab('bank')}>
            指数 / 对数题库
          </button>
        </div>
      </div>

      {loading && <div className="hint"><Spinner /> 加载中…</div>}

      {(tab === 'math' || tab === 'physics') && (
        <>
          {graph[tab] && !graph[tab].verified && (
            <Banner tone="warn">
              物理脉络尚无教材资料支撑，当前按人教 2019 版通用目录自拟，仅作学科导航，不参与判题。
              提供教材/提纲后可替换为正式版本。
            </Banner>
          )}
          {graph[tab]?.lines.map((line) => (
            <details key={line.line} className="line-block" open={tab === 'math' && line.line.includes('函数')}>
              <summary>
                <span className="idx">{line.line}</span>
                <span>{line.desc}</span>
                <span className="desc">{line.chapters.length} 章</span>
              </summary>
              {line.chapters.map((c) => (
                <div key={c.chapter} className="chapter">
                  <h4>
                    {c.chapter}
                    <span className="book">{c.book}</span>
                  </h4>
                  <ul>
                    {c.concepts.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  {c.formulas.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {c.formulas.map((f) => (
                        <div key={f} className="hint" style={{ color: 'var(--ink-2)' }}>
                          · <Tex latex={f} />
                        </div>
                      ))}
                    </div>
                  )}
                  {c.methods.length > 0 && (
                    <div className="hint" style={{ marginTop: 6 }}>
                      方法：{c.methods.join(' / ')}
                    </div>
                  )}
                  {c.traps.length > 0 && <div className="traps">易错：{c.traps.join('；')}</div>}
                </div>
              ))}
            </details>
          ))}
          {!graph[tab] && !loading && <EmptyState title="暂无脉络数据" />}
        </>
      )}

      {tab === 'bank' && (
        <>
          <Banner tone="info">
            8 道自编仿真题（指数 4 / 对数 4），带标准解节点与易错标签。题库内容只作溯源印证，
            不整段复制外部资料，也不含真题原文。
          </Banner>
          {questions?.map((q) => (
            <div key={q.question_id} className="q-card">
              <div className="spread">
                <span className="qid">{q.question_id}</span>
                <div className="row">
                  <Badge tone={q.topic === 'exponential' ? 'accent' : 'info'}>
                    {q.topic === 'exponential' ? '指数函数' : '对数函数'}
                  </Badge>
                  <Badge tone="neutral">难度 {'★'.repeat(q.difficulty)}</Badge>
                </div>
              </div>
              <div className="q-stem">
                <RichText text={q.stem} />
              </div>
              <div className="q-solution">
                <div className="hint" style={{ marginBottom: 6 }}>
                  方法：{q.standard_solution.method} · 答案：
                  <Tex latex={q.standard_solution.answer} />
                </div>
                {q.standard_solution.nodes.map((n) => (
                  <div key={n.node_id} className="node-row">
                    <span className="nid">{n.node_id}</span>
                    <div>
                      <div>{n.goal}</div>
                      <div style={{ color: 'var(--ink-3)' }}>
                        <Tex latex={n.formula} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="hint" style={{ marginTop: 6 }}>
                  知识点：{q.knowledge_points.join(' · ')} · {q.source.license_note}
                </div>
              </div>
            </div>
          ))}
          {!questions && !loading && <EmptyState title="题库为空" />}
        </>
      )}
    </div>
  )
}
