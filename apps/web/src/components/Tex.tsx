import { useMemo } from 'react'
import katex from 'katex'

interface TexProps {
  latex: string | null | undefined
  display?: boolean
  className?: string
}

/**
 * KaTeX 渲染兜底：坏公式降级为源码 + 标记，绝不抛到 React 树导致整页白屏。
 */
export function Tex({ latex, display = false, className }: TexProps) {
  const result = useMemo(() => {
    if (!latex || !latex.trim()) return { ok: false, empty: true, html: '' }
    try {
      const html = katex.renderToString(latex, {
        displayMode: display,
        throwOnError: true,
        strict: 'ignore' as unknown as boolean,
        trust: false,
        output: 'html',
      })
      return { ok: true, empty: false, html }
    } catch {
      return { ok: false, empty: false, html: '' }
    }
  }, [latex, display])

  if (result.empty) return null

  if (!result.ok) {
    return (
      <span className="tex-fallback" title="LaTeX 无法解析，已降级显示源码">
        <code>{latex}</code>
        <span className="tag">公式未正常渲染</span>
      </span>
    )
  }

  const Tag = display ? 'div' : 'span'
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: result.html }}
      style={display ? { overflowX: 'auto' } : undefined}
    />
  )
}

/** 支持 $...$ 行内公式的富文本 */
export function RichText({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/(\$[^$]+\$)/g), [text])
  return (
    <>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith('$') && p.endsWith('$')) {
          return <Tex key={i} latex={p.slice(1, -1)} />
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

/**
 * 内容不确定是公式还是普通文字时的安全渲染：
 * 只有出现 LaTeX 特征字符时才交给 KaTeX，纯中文不会被误判成坏公式。
 */
export function MathMaybe({ text, placeholder = '（未读出）' }: { text: string | null; placeholder?: string }) {
  if (!text) return <span className="hint">{placeholder}</span>
  const looksMath = /[\\^_{}]/.test(text)
  return looksMath ? <Tex latex={text} /> : <span>{text}</span>
}
