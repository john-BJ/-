import { useState } from 'react'
import type { BBox } from '../lib/types'

export interface StageBox {
  key: string
  bbox: BBox
  status: 'verified' | 'conflict' | 'unreadable'
  label: number
}

interface Props {
  src: string
  width: number
  height: number
  boxes: StageBox[]
  activeKey: string | null
  onSelect: (key: string) => void
}

/** 原图 + bbox 高亮：缩放用容器宽度实现，框选坐标走 SVG viewBox，缩放后依然对齐 */
export function ImageStage({ src, width, height, boxes, activeKey, onSelect }: Props) {
  const [zoom, setZoom] = useState(100)
  const [failed, setFailed] = useState(false)

  return (
    <div className="stage">
      <div className="stage-toolbar">
        <span className="hint" style={{ marginRight: 'auto' }}>
          原图 · 点框定位步骤
        </span>
        <button
          className="icon-btn"
          onClick={() => setZoom((z) => Math.max(100, z - 30))}
          disabled={zoom <= 100}
          aria-label="缩小"
        >
          −
        </button>
        <span className="mono" style={{ minWidth: 40, textAlign: 'center' }}>
          {zoom}%
        </span>
        <button
          className="icon-btn"
          onClick={() => setZoom((z) => Math.min(250, z + 30))}
          disabled={zoom >= 250}
          aria-label="放大"
        >
          +
        </button>
        <button className="btn btn-sm" onClick={() => setZoom(100)}>
          适应
        </button>
      </div>

      <div className="stage-scroll">
        <div className="stage-canvas" style={{ width: `${zoom}%` }}>
          {failed ? (
            <div className="empty" style={{ padding: 40 }}>
              原图加载失败
              <div className="hint">图片可能已过期，请重新上传</div>
            </div>
          ) : (
            <>
              <img src={src} alt="错题原图" onError={() => setFailed(true)} />
              {width > 0 && height > 0 && (
                <svg
                  className="bbox-layer"
                  viewBox={`0 0 ${width} ${height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {boxes.map((b) => {
                    const [x, y, w, h] = b.bbox
                    const active = b.key === activeKey
                    // 标签尺寸按页面宽度取值，缩放后仍可读；位置优先放框右侧空白处
                    const tagH = Math.max(24, Math.min(height * 0.038, w * 0.16))
                    const tagW = tagH * 1.5
                    const tagY = y + 2
                    let tagX = x + w + 4
                    if (tagX + tagW > width - 2) tagX = x - tagW - 4
                    if (tagX < 2) tagX = Math.max(2, x + w - tagW - 2)
                    return (
                      <g key={b.key} onClick={() => onSelect(b.key)}>
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          rx={4}
                          className={`bbox${active ? ' active' : ''}${
                            b.status === 'conflict' ? ' conflict' : ''
                          }`}
                        />
                        <g pointerEvents="none" opacity={active ? 1 : 0.72}>
                          <rect
                            x={tagX}
                            y={tagY}
                            width={tagW}
                            height={tagH}
                            rx={3}
                            className="bbox-tag-bg"
                            opacity={active ? 1 : 0.55}
                          />
                          <text
                            x={tagX + tagW / 2}
                            y={tagY + tagH * 0.78}
                            textAnchor="middle"
                            className="bbox-label"
                            style={{ fontSize: tagH * 0.6 }}
                          >
                            {b.label}
                          </text>
                        </g>
                      </g>
                    )
                  })}
                </svg>
              )}
            </>
          )}
        </div>
      </div>

      <div className="legend">
        <span>
          <i style={{ background: 'rgba(153,60,29,.13)', border: '1px solid #993C1D' }} />
          当前步骤
        </span>
        <span>
          <i style={{ background: '#fff', border: '1px dashed #B4761E' }} />
          双通道冲突
        </span>
        <span>
          <i style={{ background: 'rgba(58,86,117,.05)', border: '1px solid rgba(58,86,117,.55)' }} />
          其他步骤
        </span>
      </div>
    </div>
  )
}
