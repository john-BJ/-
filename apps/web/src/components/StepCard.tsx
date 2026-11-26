import { useRef, useState } from 'react'
import { MathMaybe, Tex } from './Tex'
import { Badge } from './ui'
import type { EditableStep } from '../store/useFlow'

interface Props {
  step: EditableStep
  position: number
  active: boolean
  isLast: boolean
  onFocusStep: () => void
  onText: (v: string) => void
  onLatex: (v: string) => void
  onMove: (dir: -1 | 1) => void
  onSplit: (pos: number) => void
  onMerge: () => void
  onToggle: () => void
  onResolve: (choice: 'ocr' | 'vision') => void
  onRemove: () => void
}

export function StepCard({
  step,
  position,
  active,
  isLast,
  onFocusStep,
  onText,
  onLatex,
  onMove,
  onSplit,
  onMerge,
  onToggle,
  onResolve,
  onRemove,
}: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [splitMode, setSplitMode] = useState(false)
  const [showLatex, setShowLatex] = useState(Boolean(step.latex))

  const conflict = step.conflict
  const resolved = Boolean(step.resolvedChoice)
  const lowConf = step.conf < 0.6

  return (
    <div
      className={`step-card${active ? ' active' : ''}${step.included ? '' : ' excluded'}`}
      onClick={onFocusStep}
      data-step-key={step.key}
    >
      <div className="step-head">
        <span className="step-no">{position}</span>
        {conflict && !resolved && <Badge tone="warn" dot>双通道冲突</Badge>}
        {conflict && resolved && <Badge tone="ok" dot>已裁定</Badge>}
        {lowConf && <Badge tone="err">低置信 {Math.round(step.conf * 100)}%</Badge>}
        {step.status === 'unreadable' && <Badge tone="err">无法辨认</Badge>}
        {!step.included && <Badge tone="neutral">已划掉</Badge>}

        <div className="step-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title="上移" onClick={() => onMove(-1)} disabled={position === 1}>
            ↑
          </button>
          <button className="icon-btn" title="下移" onClick={() => onMove(1)} disabled={isLast}>
            ↓
          </button>
          <button
            className="icon-btn"
            title="在光标处拆分"
            onClick={() => setSplitMode((v) => !v)}
            disabled={step.text.length < 2}
          >
            ✂
          </button>
          <button className="icon-btn" title="与下一步合并" onClick={onMerge} disabled={isLast}>
            ⇩
          </button>
          <button
            className="icon-btn"
            title={step.included ? '标记为划掉（不计入解答）' : '恢复该步骤'}
            onClick={onToggle}
          >
            {step.included ? '⊘' : '↺'}
          </button>
          {!step.bbox && (
            <button className="icon-btn" title="删除该步骤" onClick={onRemove}>
              ×
            </button>
          )}
        </div>
      </div>

      <div className="step-body" onClick={(e) => e.stopPropagation()}>
        <textarea
          ref={textRef}
          className="field"
          value={step.text}
          rows={Math.min(5, Math.max(2, Math.ceil(step.text.length / 26)))}
          placeholder="这一步写了什么？可直接改写"
          onChange={(e) => onText(e.target.value)}
        />

        {splitMode && (
          <div className="conflict-box" style={{ borderColor: 'var(--line-strong)', background: 'var(--paper-2)' }}>
            <div className="conflict-title" style={{ color: 'var(--ink-2)' }}>
              拆分模式
            </div>
            <div className="hint">把光标放到要断开的位置，然后确认。拆出的两段都会保留，可继续编辑。</div>
            <div className="row">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  const pos = textRef.current?.selectionStart ?? Math.floor(step.text.length / 2)
                  if (pos <= 0 || pos >= step.text.length) {
                    alert('请先把光标放在文字中间')
                    return
                  }
                  onSplit(pos)
                  setSplitMode(false)
                }}
              >
                在光标处拆分
              </button>
              <button className="btn btn-sm" onClick={() => setSplitMode(false)}>
                取消
              </button>
            </div>
          </div>
        )}

        <div>
          <div className="field-label">
            公式（LaTeX）
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '0 6px', fontSize: 11 }}
              onClick={() => setShowLatex((v) => !v)}
            >
              {showLatex ? '收起' : '改公式'}
            </button>
          </div>
          {showLatex ? (
            <>
              <input
                className="field latex"
                value={step.latex ?? ''}
                placeholder="例如 \frac{1}{2}x^{2}-3x+1"
                onChange={(e) => onLatex(e.target.value)}
                spellCheck={false}
              />
              <div className="formula-preview" style={{ marginTop: 6 }}>
                {step.latex ? <Tex latex={step.latex} /> : <span className="hint">暂无公式，可留空</span>}
              </div>
            </>
          ) : step.latex ? (
            <div className="formula-preview">
              <Tex latex={step.latex} />
            </div>
          ) : null}
        </div>

        {conflict && (
          <div className={`conflict-box${resolved ? ' resolved' : ''}`}>
            <div className="conflict-title">
              {resolved ? '✓ 冲突已裁定' : '⚠ 两个通道读数不一致'}
              <span className="hint" style={{ fontWeight: 400 }}>
                {conflict.level === 'slice' ? '（切片粒度不同）' : conflict.level === 'char' ? '（个别字符不同）' : '（公式结构不同）'}
              </span>
            </div>
            <div className="candidates">
              <button
                className={`candidate${step.resolvedChoice === 'ocr' ? ' chosen' : ''}`}
                onClick={() => onResolve('ocr')}
              >
                <span className="src">A · 印刷/公式通道</span>
                <span className="val">
                  <MathMaybe text={conflict.ocr} />
                </span>
              </button>
              <button
                className={`candidate${step.resolvedChoice === 'vision' ? ' chosen' : ''}`}
                onClick={() => onResolve('vision')}
              >
                <span className="src">B · 手写通道</span>
                <span className="val">
                  <MathMaybe text={conflict.vision} />
                </span>
              </button>
            </div>
            {!resolved && (
              <div className="hint">
                两条候选都不对？直接改上方公式框，改完即视为「自行改写」，冲突自动消解。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
