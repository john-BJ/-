import { useEffect, useState } from 'react'
import { api, type RecordItem, type RecordsResponse } from '../lib/api'
import { Modal } from '../components/Modal'
import { Tex, RichText } from '../components/Tex'
import { Badge, Banner, EmptyState, PanelHead, Spinner } from '../components/ui'
import type { GradeResult } from '../lib/types'

const OVERALL: Record<string, { tone: 'ok' | 'warn' | 'err' | 'neutral'; text: string }> = {
  correct: { tone: 'ok', text: '全对' },
  partial: { tone: 'warn', text: '部分正确' },
  wrong: { tone: 'err', text: '有误' },
  unjudged: { tone: 'neutral', text: '未判' },
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function RecordsView() {
  const [data, setData] = useState<RecordsResponse | null>(null)
  const [labels, setLabels] = useState<string[]>([])
  const [overall, setOverall] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<RecordItem | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .records({ labels, overall: overall ?? undefined })
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [labels, overall])

  function toggleLabel(label: string) {
    setLabels((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]))
  }

  return (
    <div className="panel">
      <PanelHead
        eyebrow="History"
        title="我的错题"
        sub={data ? `共 ${data.total} 条记录 · 当前筛选 ${data.items.length} 条` : undefined}
      />

      <div className="stat-chips">
        <button
          className={`label-chip${labels.length === 0 && !overall ? ' on' : ''}`}
          onClick={() => {
            setLabels([])
            setOverall(null)
          }}
        >
          全部
        </button>
        {data?.label_stats.map((s) => (
          <button
            key={s.label}
            className={`label-chip${labels.includes(s.label) ? ' on' : ''}${s.count === 0 ? ' empty' : ''}`}
            onClick={() => toggleLabel(s.label)}
            disabled={s.count === 0}
          >
            {s.label}
            <b>{s.count}</b>
          </button>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <span className="hint" style={{ marginRight: 2 }}>结果</span>
        {(['correct', 'partial', 'wrong'] as const).map((k) => (
          <button
            key={k}
            className={`btn btn-sm${overall === k ? ' btn-primary' : ''}`}
            onClick={() => setOverall(overall === k ? null : k)}
          >
            {OVERALL[k].text}
          </button>
        ))}
        {labels.length > 0 && (
          <span className="hint">标签筛选：{labels.join(' / ')}（可多选，单题仍是七选一）</span>
        )}
      </div>

      {error && <Banner tone="err">{error}</Banner>}
      {loading && !data && (
        <div className="hint">
          <Spinner /> 加载中…
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          icon="◌"
          title="还没有符合条件的记录"
          desc={data.total === 0 ? '去「批改台」拍一道错题，完成首次批改后会出现在这里' : '试试取消筛选条件'}
        />
      )}

      <div className="record-list">
        {data?.items.map((r) => {
          const o = OVERALL[r.overall] ?? OVERALL.unjudged
          return (
            <button key={r.task_id} className="record-card" onClick={() => setDetail(r)}>
              <div className="record-top">
                <Badge tone={o.tone}>{o.text}</Badge>
                {r.primary_label ? <Badge tone="accent">{r.primary_label}</Badge> : null}
                <span className="hint" style={{ marginLeft: 'auto' }}>
                  {fmtDate(r.created_at)}
                </span>
              </div>
              <div className="record-stem">
                {r.stem_snippet ? <RichText text={r.stem_snippet} /> : '（无题干摘要）'}
              </div>
              <div className="record-meta">
                <span>方法：{r.method}</span>
                {r.first_error_step != null && <span>首错步：第 {r.first_error_step} 步</span>}
                <span className="mono">{r.question_id ?? 'model_solution'}</span>
              </div>
            </button>
          )
        })}
      </div>

      <RecordDetail item={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

function RecordDetail({ item, onClose }: { item: RecordItem | null; onClose: () => void }) {
  const [grade, setGrade] = useState<(GradeResult & { created_at: string }) | null>(null)
  const [derivation, setDerivation] = useState<{ text: string; latex: string | null }[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!item) {
      setGrade(null)
      setDerivation(null)
      return
    }
    let alive = true
    setBusy(true)
    api
      .record(item.task_id)
      .then((g) => alive && setGrade(g))
      .catch(() => undefined)
      .finally(() => alive && setBusy(false))
    return () => {
      alive = false
    }
  }, [item])

  const el = grade?.error_localization

  return (
    <Modal open={Boolean(item)} onClose={onClose} title="错题详情" subtitle={item ? fmtDate(item.created_at) : ''} width={640}>
      {busy && !grade && (
        <div className="hint">
          <Spinner /> 加载中…
        </div>
      )}
      {grade && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="row">
            <Badge tone={(OVERALL[grade.overall] ?? OVERALL.unjudged).tone}>
              {(OVERALL[grade.overall] ?? OVERALL.unjudged).text}
            </Badge>
            {el?.primary_label && <Badge tone="accent">{el.primary_label}</Badge>}
            <Badge tone="neutral">
              {grade.provenance.source_type === 'bank' ? `题库 ${grade.provenance.question_id}` : '模型独立解答'}
            </Badge>
          </div>

          <div>
            <div className="field-label">正确答案</div>
            <div style={{ fontSize: 18 }}>
              <Tex latex={grade.answer_latex} display />
            </div>
          </div>

          <div>
            <div className="field-label">方法</div>
            <div>{grade.method}</div>
          </div>

          <div>
            <div className="field-label">关键步骤骨架</div>
            <ol className="skeleton-list">
              {grade.skeleton.map((s, i) => (
                <li key={s.idx} className={`skeleton-item${grade.node_judgement[i]?.verdict !== 'correct' ? ' bad' : ''}`}>
                  <span className="sk-no">{s.idx}</span>
                  <div>
                    <div className="sk-goal">{s.goal}</div>
                    <div className="sk-formula">
                      <Tex latex={s.formula} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {el && el.first_error_step != null && (
            <div className="error-step">
              <span className="k">首错步 · 第 {el.first_error_step} 步</span>
              <div>{el.step_text}</div>
              <div className="hint" style={{ marginTop: 6 }}>
                应为：{el.expected_action}
              </div>
            </div>
          )}

          {el?.basis && <div className="basis">判定依据：{el.basis}</div>}

          {!derivation ? (
            <button
              className="btn btn-sm"
              onClick={async () => {
                const r = await api.derivation(grade.task_id)
                setDerivation(r.derivation)
              }}
            >
              解锁完整解析
            </button>
          ) : (
            <div className="derivation">
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
        </div>
      )}
    </Modal>
  )
}
