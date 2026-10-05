import type { ReactNode } from 'react'
import styles from './ReaderPanels.module.css'
import {
  FONT_SIZE, LINE_HEIGHT, THEMES,
  type ReaderSettings, type ReaderTheme,
} from '../utils/readerSettings'

// Side panels and the help sheet for BookReaderPage. Every control carries
// data-nav so the reader can walk focus through them with a controller.

interface DrawerProps {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

export function Drawer({ title, onClose, children, wide }: DrawerProps): JSX.Element {
  return (
    <div className={styles.scrim} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className={`${styles.drawer} ${wide ? styles.wide : ''}`} role="dialog" aria-label={title}>
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} data-nav aria-label="Close">✕</button>
        </header>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>
  )
}

// ─── Contents ────────────────────────────────────────────────────────────────

interface ContentsProps {
  chapters: { title: string }[]
  current: number
  /** First page of each chapter (1-based), when known. */
  startPages: (number | null)[]
  onJump: (chapter: number) => void
}

export function ContentsList({ chapters, current, startPages, onJump }: ContentsProps): JSX.Element {
  return (
    <ol className={styles.list}>
      {chapters.map((ch, i) => (
        <li key={i}>
          <button
            className={`${styles.row} ${i === current ? styles.rowActive : ''}`}
            onClick={() => onJump(i)}
            data-nav
            data-autofocus={i === current ? '' : undefined}
          >
            <span className={styles.rowText}>{ch.title}</span>
            {startPages[i] != null && <span className={styles.rowMeta}>{startPages[i]}</span>}
          </button>
        </li>
      ))}
    </ol>
  )
}

// ─── Bookmarks ───────────────────────────────────────────────────────────────

interface BookmarksProps {
  bookmarks: Bookmark[]
  pageOf: (position: number) => number | null
  onJump: (b: Bookmark) => void
  onRemove: (b: Bookmark) => void
}

export function BookmarkList({ bookmarks, pageOf, onJump, onRemove }: BookmarksProps): JSX.Element {
  if (bookmarks.length === 0) {
    return <p className={styles.empty}>No bookmarks yet. Press <kbd>B</kbd> or <kbd>Y</kbd> on a page to add one.</p>
  }
  return (
    <ul className={styles.list}>
      {bookmarks.map((b) => {
        const page = pageOf(b.position)
        return (
          <li key={b.id} className={styles.bookmark}>
            <button className={styles.row} onClick={() => onJump(b)} data-nav>
              <span className={styles.rowText}>
                <span className={styles.bmChapter}>{b.chapter}{page != null ? ` · p. ${page}` : ''}</span>
                <span className={styles.bmSnippet}>{b.snippet || '—'}</span>
              </span>
            </button>
            <button className={styles.remove} onClick={() => onRemove(b)} data-nav aria-label="Remove bookmark">✕</button>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Settings ────────────────────────────────────────────────────────────────

interface SettingsProps {
  settings: ReaderSettings
  /** True when this book has its own settings rather than the defaults. */
  bookOnly: boolean
  onChange: (s: ReaderSettings) => void
  onBookOnly: (on: boolean) => void
}

function Segmented<T extends string>({ value, options, onPick }: {
  value: T
  options: { value: T; label: ReactNode }[]
  onPick: (v: T) => void
}): JSX.Element {
  return (
    <div className={styles.segmented}>
      {options.map((o) => (
        <button
          key={o.value}
          className={`${styles.segment} ${o.value === value ? styles.segmentOn : ''}`}
          onClick={() => onPick(o.value)}
          aria-pressed={o.value === value}
          data-nav
        >{o.label}</button>
      ))}
    </div>
  )
}

function Stepper({ value, label, min, max, step, onSet }: {
  value: number; label: string; min: number; max: number; step: number; onSet: (v: number) => void
}): JSX.Element {
  const set = (v: number): void => onSet(Math.round(Math.min(max, Math.max(min, v)) * 10) / 10)
  return (
    <div className={styles.stepper}>
      <button onClick={() => set(value - step)} disabled={value <= min} data-nav aria-label={`Smaller ${label}`}>−</button>
      <span className={styles.stepValue}>{label}</span>
      <button onClick={() => set(value + step)} disabled={value >= max} data-nav aria-label={`Larger ${label}`}>+</button>
    </div>
  )
}

export function SettingsForm({ settings: s, bookOnly, onChange, onBookOnly }: SettingsProps): JSX.Element {
  const set = <K extends keyof ReaderSettings>(k: K, v: ReaderSettings[K]): void => onChange({ ...s, [k]: v })
  return (
    <div className={styles.settings}>
      <div className={styles.field}>
        <span className={styles.label}>Applies to</span>
        <Segmented
          value={bookOnly ? 'book' : 'all'}
          options={[{ value: 'all', label: 'All books' }, { value: 'book', label: 'This book only' }]}
          onPick={(v) => onBookOnly(v === 'book')}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Theme</span>
        <div className={styles.themes}>
          {(Object.keys(THEMES) as ReaderTheme[]).map((t) => (
            <button
              key={t}
              className={`${styles.theme} ${s.theme === t ? styles.themeOn : ''}`}
              style={{ background: THEMES[t].page, color: THEMES[t].fg }}
              onClick={() => set('theme', t)}
              aria-pressed={s.theme === t}
              data-nav
            >
              <span className={styles.themeAa}>Aa</span>
              <span className={styles.themeName}>{t === 'black' ? 'Black' : t[0].toUpperCase() + t.slice(1)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Text size</span>
        <Stepper value={s.fontSize} label={`${s.fontSize}px`} {...FONT_SIZE} onSet={(v) => set('fontSize', v)} />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Font</span>
        <Segmented
          value={s.font}
          options={[
            { value: 'serif', label: <span style={{ fontFamily: 'Georgia, serif' }}>Serif</span> },
            { value: 'sans', label: <span style={{ fontFamily: '"Segoe UI", system-ui, sans-serif' }}>Sans</span> },
          ]}
          onPick={(v) => set('font', v)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Line spacing</span>
        <Stepper value={s.lineHeight} label={s.lineHeight.toFixed(1)} {...LINE_HEIGHT} onSet={(v) => set('lineHeight', v)} />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Line length</span>
        <Segmented
          value={s.width}
          options={[{ value: 'narrow', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'wide', label: 'Long' }]}
          onPick={(v) => set('width', v)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Margins</span>
        <Segmented
          value={s.margin}
          options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]}
          onPick={(v) => set('margin', v)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Pages side by side</span>
        <Segmented
          value={s.pagesPerView}
          options={[{ value: 'auto', label: 'When wide enough' }, { value: 'one', label: 'Always one' }]}
          onPick={(v) => set('pagesPerView', v)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Book&apos;s own styling</span>
        <Segmented
          value={s.publisherStyles ? 'on' : 'off'}
          options={[{ value: 'on', label: 'Keep' }, { value: 'off', label: 'Use mine' }]}
          onPick={(v) => set('publisherStyles', v === 'on')}
        />
        <p className={styles.hint}>
          Keep uses the publisher&apos;s fonts and spacing. Use mine sets every book in your font and spacing.
        </p>
      </div>
    </div>
  )
}

// ─── Help ────────────────────────────────────────────────────────────────────

const CONTROLS: [string, string, string][] = [
  ['Next page',        'D-pad → · RB',  '→ · PgDn · Space'],
  ['Previous page',    'D-pad ← · LB',  '← · PgUp · Shift+Space'],
  ['Next chapter',     'RT',            ']'],
  ['Previous chapter', 'LT',            '['],
  ['Show / hide bar',  'A',             'Enter'],
  ['Contents',         'X',             'C'],
  ['Bookmark this page', 'Y',           'B'],
  ['Settings',         'Start',         'S'],
  ['This help',        'View',          '? · H'],
  ['Close panel / back', 'B',           'Esc'],
]

export function HelpSheet({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className={styles.scrim} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.help} role="dialog" aria-label="Reader controls">
        <h2 className={styles.title}>Reader controls</h2>
        <table className={styles.table}>
          <thead><tr><th>Action</th><th>Controller</th><th>Keyboard</th></tr></thead>
          <tbody>
            {CONTROLS.map(([a, c, k]) => <tr key={a}><td>{a}</td><td>{c}</td><td>{k}</td></tr>)}
          </tbody>
        </table>
        <p className={styles.hint}>
          Mouse or touch: click the left or right side of the page to turn it, the middle to show the bar.
          The scroll wheel turns pages too.
        </p>
        <button className={styles.primary} onClick={onClose} data-nav data-autofocus="">Got it</button>
      </div>
    </div>
  )
}
