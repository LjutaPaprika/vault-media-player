import { useState } from 'react'

interface Props {
  filePath: string
  title?: string
  onBack: () => void
}

function toMediaUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return `media:///${normalized}`
}

export default function PDFReaderPage({ filePath, title, onBack }: Props): JSX.Element {
  const [loaded, setLoaded] = useState(false)
  const src = toMediaUrl(filePath)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '12px 24px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}>
        <button
          onClick={onBack}
          style={{
            fontSize: 14, color: 'var(--text-secondary)',
            padding: '6px 12px', borderRadius: 'var(--radius-sm)',
            transition: 'color 0.15s, background 0.15s'
          }}
        >
          ‹ Back
        </button>
        {title && (
          <span style={{
            fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {title}
          </span>
        )}
        {!loaded && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Loading PDF…
          </span>
        )}
      </div>

      {/* PDF viewer */}
      <iframe
        key={src}
        src={src}
        style={{ flex: 1, border: 'none', width: '100%', opacity: loaded ? 1 : 0, transition: 'opacity 0.2s' }}
        title={title ?? 'PDF'}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
