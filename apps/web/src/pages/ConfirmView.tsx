import { useEffect, useMemo, useState } from 'react'
import type { FlowApi } from '../store/useFlow'
import { ImageStage, type StageBox } from '../components/ImageStage'
import { StepCard } from '../components/StepCard'
import { Badge, Banner, PanelHead } from '../components/ui'

export function ConfirmView({ flow }: { flow: FlowApi }) {
  const { state, unresolvedConflicts, canConfirm } = flow
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const included = state.steps.filter((s) => s.included)
  const excluded = state.steps.filter((s) => !s.included)
  const conflicts = state.steps.filter((s) => s.conflict)

  useEffect(() => {
    if (activeKey) return
    const first = state.steps.find((s) => s.conflict && !s.resolvedChoice) ?? state.steps[0]
    if (first) setActiveKey(first.key)
  }, [activeKey, state.steps])

  useEffect(() => {
    if (!activeKey) return
    const el = document.querySelector(`[data-step-key="${activeKey}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeKey])

  const boxes: StageBox[] = useMemo(
    () =>
      state.steps
        .map((s, i) => ({ s, label: i + 1 }))
        .filter(({ s }) => s.bbox)
        .map(({ s, label }) => ({
          key: s.key,
          bbox: s.bbox!,
          status: s.status,
          label,
        })),
    [state.steps],
  )

  const imgW = state.uploadMeta?.width ?? 1000
  const imgH = state.uploadMeta?.height ?? 1400

  return (
    <>
      <div className="confirm-grid">
        <div className="stage-col">
          <ImageStage
            src={flow.imageSrc}
            width={imgW}
            height={imgH}
            boxes={boxes}
            activeKey={activeKey}
            onSelect={setActiveKey}
          />

          <div className="meta-strip" style={{ marginTop: 10 }}>
            <Badge tone={state.recognition?.meta.provider_mode === 'live' ? 'ok' : 'warn'}>
              {state.recognition?.meta.provider_mode === 'live' ? '真实模型' : '演示样本'}
            </Badge>
            <span>识别置信均值 {Math.round((state.recognition?.meta.vision_conf_avg ?? 0) * 100)}%</span>
            {state.recognition?.meta.model_trace.map((t) => (
              <span key={t.role} className="mono">
                {t.role} {t.ms}ms
              </span>
            ))}
          </div>

          {state.removedMarks.length > 0 && (
            <details className="excluded-list" style={{ marginTop: 10 }}>
              <summary>
                识别时清理的涂改 {state.removedMarks.length} 项 · 展开查看
              </summary>
              {state.removedMarks.map((m) => (
                <div key={m.idx} className="removed-item">
                  <Badge tone="neutral">
                    {m.reason === 'crossed_out' ? '划掉' : m.reason === 'draft' ? '草稿' : '页边'}
                  </Badge>
                  <span className="strike-text">{m.text}</span>
                </div>
              ))}
              <div className="hint" style={{ marginTop: 6 }}>
                这些内容不会进入批改，但留痕可追溯。
              </div>
            </details>
          )}
        </div>

        <div className="steps-col">
          <div className="steps-head">
            <PanelHead eyebrow="Step 2b" title="②b 回显确认" sub="全链路仅此一次人工确认" />
            <div className="row">
              <Badge tone="neutral">{included.length} 步计入</Badge>
              {conflicts.length > 0 && (
                <Badge tone={unresolvedConflicts.length ? 'warn' : 'ok'}>
                  {unresolvedConflicts.length ? `${unresolvedConflicts.length} 处待裁定` : '冲突已处理'}
                </Badge>
              )}
            </div>
          </div>

          <Banner tone="info">
            左边原图、右边识别文本。逐条核对：可直接改文字、改公式、拆分/合并/重排、把写废的步骤划掉。
            <strong>确认之前，识别结果不生效。</strong>
          </Banner>

          {state.recognition?.meta.warnings.map((w, i) => (
            <Banner key={i} tone="warn">
              {w}
            </Banner>
          ))}

          {state.steps.map((s, i) => (
            <StepCard
              key={s.key}
              step={s}
              position={i + 1}
              active={s.key === activeKey}
              isLast={i === state.steps.length - 1}
              onFocusStep={() => setActiveKey(s.key)}
              onText={(v) => flow.updateText(s.key, v)}
              onLatex={(v) => flow.updateLatex(s.key, v)}
              onMove={(d) => flow.moveStep(s.key, d)}
              onSplit={(pos) => flow.splitStep(s.key, pos)}
              onMerge={() => flow.mergeStep(s.key)}
              onToggle={() => flow.toggleInclude(s.key)}
              onResolve={(c) => flow.resolveConflict(s.key, c)}
              onRemove={() => flow.removeStep(s.key)}
            />
          ))}

          <button className="btn btn-block" onClick={flow.addStep}>
            ＋ 补充一步（识别漏掉的）
          </button>

          {excluded.length > 0 && (
            <details className="excluded-list" open>
              <summary>已划掉的步骤 {excluded.length} 条 · 不计入解答，可恢复</summary>
              {excluded.map((s) => (
                <div key={s.key} className="removed-item">
                  <span className="strike-text" style={{ flex: 1 }}>
                    {s.text || '（空）'}
                  </span>
                  <button className="btn btn-sm" onClick={() => flow.toggleInclude(s.key)}>
                    恢复
                  </button>
                </div>
              ))}
            </details>
          )}

          <div>
            <div className="field-label">学生补充说明（可选）</div>
            <textarea
              className="field"
              rows={2}
              value={note}
              maxLength={500}
              placeholder="例如：第 2 步我当时想的是…"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="actionbar">
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className="hint">
                确认后生成 ConfirmedSolution v1，带确认时间戳；下游批改只认这份数据。
              </div>
              {unresolvedConflicts.length > 0 && (
                <div className="hint" style={{ color: 'var(--warn)' }}>
                  还有 {unresolvedConflicts.length} 处冲突未裁定（第 {unresolvedConflicts.join('、')} 步）
                </div>
              )}
              {included.length === 0 && (
                <div className="hint" style={{ color: 'var(--err)' }}>
                  至少要保留 1 个步骤才能继续
                </div>
              )}
            </div>
            <button className="btn" onClick={flow.reset}>
              放弃
            </button>
            <button
              className="btn btn-primary btn-lg"
              disabled={!canConfirm}
              onClick={() => void flow.confirmSolution(note)}
            >
              确认无误，进入批改
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
