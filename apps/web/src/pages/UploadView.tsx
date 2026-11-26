import { useRef, useState } from 'react'
import type { FlowApi } from '../store/useFlow'
import { describeBytes, SHARPNESS_HINT } from '../lib/image'
import { Badge, Banner, PanelHead, Spinner } from '../components/ui'

export function UploadView({ flow }: { flow: FlowApi }) {
  const { state } = flow
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const ready = Boolean(state.uploadMeta) && !state.uploading

  return (
    <div className="upload-grid">
      <section className="panel">
        <PanelHead eyebrow="Step 1" title="① 拍照上传错题" sub="可含已写的错解" />

        {state.error && (
          <Banner tone="err">
            <strong>{state.error.title}</strong>
            {state.error.detail && <div style={{ marginTop: 2 }}>{state.error.detail}</div>}
            {state.error.hint && <div className="hint" style={{ marginTop: 4 }}>{state.error.hint}</div>}
          </Banner>
        )}

        {!state.prepared ? (
          <>
            <div
              className={`dropzone${dragging ? ' dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files?.[0]
                if (f) void flow.pickFile(f, state.isExam)
              }}
            >
              <div className="dz-icon">📷</div>
              <p>把整道题拍进画面，包含题干与你的解答</p>
              <div className="dz-actions">
                <button className="btn btn-primary" onClick={() => cameraRef.current?.click()}>
                  拍照
                </button>
                <button className="btn" onClick={() => galleryRef.current?.click()}>
                  从相册选择
                </button>
              </div>
              <div className="hint" style={{ marginTop: 10 }}>
                桌面端可直接拖拽图片到此处 · 单张 ≤ 12MB
              </div>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void flow.pickFile(f, state.isExam)
                e.target.value = ''
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void flow.pickFile(f, state.isExam)
                e.target.value = ''
              }}
            />
          </>
        ) : (
          <div className="preview-card">
            <div className="preview-thumb">
              <img src={state.prepared.url} alt="待识别照片预览" />
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <div className="row">
                <Badge tone="ok">已压缩至长边 1800px</Badge>
                {state.uploadMeta?.dedup_hit && <Badge tone="info">命中历史图片</Badge>}
                {state.uploading && <Badge tone="neutral">上传中 {state.uploadPct}%</Badge>}
              </div>
              <dl className="kv">
                <dt>尺寸</dt>
                <dd>
                  {state.prepared.width} × {state.prepared.height}
                </dd>
                <dt>体积</dt>
                <dd>
                  {describeBytes(state.prepared.originalBytes)} → {describeBytes(state.prepared.blob.size)}
                </dd>
                <dt>感知哈希</dt>
                <dd className="mono">{state.prepared.phash}</dd>
                <dt>清晰度</dt>
                <dd>
                  {state.prepared.sharpness}
                  {state.prepared.sharpness < SHARPNESS_HINT && (
                    <span style={{ color: 'var(--warn)' }}> · 偏低，建议重拍</span>
                  )}
                </dd>
              </dl>

              {state.prepared.sharpness < SHARPNESS_HINT && (
                <Banner tone="warn">
                  照片可能偏糊，公式上标容易识别错。可以重拍一张，或继续（识别后需人工确认）。
                </Banner>
              )}
              {state.uploadMeta?.dedup_hit && (
                <Banner tone="info">
                  这张图与之前的记录重复（感知哈希相近），已复用原图，不重复归档。
                </Banner>
              )}

              <div className="row">
                <button
                  className="btn btn-primary"
                  disabled={!ready}
                  onClick={() => void flow.startRecognize()}
                >
                  {state.uploading ? <Spinner /> : null}
                  {state.uploading ? '上传中…' : '开始双通道识别'}
                </button>
                <button className="btn" onClick={flow.reset}>
                  换一张
                </button>
              </div>
            </div>
          </div>
        )}

        <label className="checkline">
          <input
            type="checkbox"
            checked={state.isExam}
            onChange={(e) => flow.setExamFlag(e.target.checked)}
          />
          <span>
            本题来自<strong>真题 / 考试原卷</strong>。勾选后按硬口径不送往生成式模型（仅本地链路），
            与题库比对仍可用。
          </span>
        </label>
      </section>

      <section className="panel">
        <PanelHead
          eyebrow="Demo Set"
          title={state.meta?.is_mock ? '演示样本（8 条）' : '样本'}
          sub={
            state.meta?.is_mock
              ? '当前未配置模型密钥，识别结果来自标注样本'
              : undefined
          }
        />
        {state.meta?.is_mock && (
          <Banner tone="info">
            演示模式：8 条样本覆盖手写、公式、涂改、低置信、双通道冲突、题库未命中。填入{' '}
            <code className="mono">.env</code> 密钥后自动切到真实模型。
          </Banner>
        )}
        <div className="sample-grid">
          {state.meta?.samples.map((s) => (
            <button
              key={s.sample_id}
              className="sample-card"
              disabled={state.uploading}
              onClick={() => void flow.pickSample(s.sample_id, s.image_url, state.isExam)}
            >
              <div className="thumb">
                <img src={s.image_url} alt={s.title} loading="lazy" />
              </div>
              <div className="meta">
                <span className="name">{s.title}</span>
                <span className="tag">{s.tag}</span>
              </div>
            </button>
          ))}
          {!state.meta && <div className="hint">正在加载样本…</div>}
        </div>
      </section>
    </div>
  )
}
