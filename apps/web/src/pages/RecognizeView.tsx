import { useEffect, useState } from 'react'
import type { FlowApi } from '../store/useFlow'
import { Spinner } from '../components/ui'

const STAGES = [
  { label: '版面切分与区域定位', at: 12, note: '切出题干、图形、作答区' },
  { label: '印刷体识别 · PaddleOCR-VL', at: 30, note: '题干、公式、版面结构' },
  { label: '手写识别与切片 · GLM-5.3-Flash', at: 60, note: '逐步切片、划掉项分离' },
  { label: '双通道互校', at: 85, note: '逐字符 / 逐公式 / 逐切片比对' },
  { label: '整理确认页', at: 96, note: '标注冲突与低置信' },
]

export function RecognizeView({ flow }: { flow: FlowApi }) {
  const { state } = flow
  const progress = state.task?.progress ?? 2
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="panel progress-wrap">
      <div className="progress-hero">
        <div className="eyebrow">Recognizing</div>
        <h2>双通道识别中</h2>
        <p>
          {state.stageText || '正在提交任务'} · 已用时 {elapsed}s
        </p>
      </div>

      <div className="bar">
        <i style={{ width: `${progress}%` }} />
      </div>
      <div className="spread">
        <span className="hint">
          <Spinner /> 长任务异步执行，页面会自动更新，不需要等待
        </span>
        <span className="mono">{progress}%</span>
      </div>

      <div className="stage-list">
        {STAGES.map((s, i) => {
          const done = progress >= s.at
          const active = !done && (i === 0 || progress >= STAGES[i - 1].at)
          return (
            <div key={s.label} className={`stage-item${done ? ' done' : active ? ' active' : ''}`}>
              <span className="tick">{done ? '✓' : active ? '·' : ''}</span>
              <span style={{ flex: 1 }}>{s.label}</span>
              <span className="hint">{s.note}</span>
            </div>
          )
        })}
      </div>

      <div className="divider" />
      <div className="hint">
        识别结果不会直接生效：下一步需要你逐条确认，才产生下游唯一可信的 ConfirmedSolution。
      </div>
    </div>
  )
}
