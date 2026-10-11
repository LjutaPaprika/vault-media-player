import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { protocolUrl } from '../utils/mediaUrl'
import styles from './PosterModal.module.css'

/** Matches the fade-out length in PosterModal.module.css. */
const CLOSE_MS = 140

/**
 * Open/close state for a PosterModal, with room for the fade-out: `close`
 * starts it and `onClosed` runs once it has played.
 */
export function usePosterModal(onClosed: () => void): { closing: boolean; close: () => void } {
  const [closing, setClosing] = useState(false)
  const onClosedRef = useRef(onClosed)
  onClosedRef.current = onClosed
  function close(): void {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onClosedRef.current()
    }, CLOSE_MS)
  }
  return { closing, close }
}

/** Thumbnail first, the full file if the thumbnail fails, nothing if both do. */
function Art({ path, width, className, onRatio }: { path: string; width: number; className: string; onRatio?: (r: number) => void }): JSX.Element | null {
  const [stage, setStage] = useState<'thumb' | 'media' | 'gone'>('thumb')
  if (stage === 'gone') return null
  return (
    <img
      className={className}
      src={protocolUrl(stage, path, width)}
      alt=""
      draggable={false}
      decoding="async"
      onLoad={(e) => onRatio?.(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
      onError={() => setStage(stage === 'thumb' ? 'media' : 'gone')}
    />
  )
}

interface Props {
  posterPath: string | null
  /** Width-to-height of the cover frame; see the sizing note below. */
  frameRatio?: number
  closing: boolean
  onClose: () => void
  /** Width of the details column. */
  bodyWidth?: number
  /** A round ✕ in the top corner, for modals without a Cancel button. */
  closeButton?: boolean
  children: ReactNode
}

/**
 * The poster-led modal the games and movies shelves open: the cover on the
 * left, a wash of its colours behind the details on the right.
 *
 * Every modal gets the same cover frame, so items look alike whatever their
 * art. The frame is sized from the details' height, so it scales with them
 * rather than cropping more. Game box art on the drive runs 0.67 (PC) to 0.81
 * (Xbox 360) wide-to-tall, and a 0.72 frame takes at most ~10% off any of
 * those. Art far from the frame's shape (square handheld covers) is shown
 * whole over a blurred copy instead.
 */
export default function PosterModal({ posterPath, frameRatio = 0.72, closing, onClose, bodyWidth = 480, closeButton, children }: Props): JSX.Element {
  useEscapeKey(onClose)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [bodyHeight, setBodyHeight] = useState(460)
  const [ratio, setRatio] = useState(frameRatio)
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setBodyHeight(entry.borderBoxSize[0]?.blockSize ?? el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const artWidth = posterPath ? Math.round(bodyHeight * frameRatio) : 0
  const fitsFrame = Math.abs(ratio - frameRatio) <= 0.14

  return (
    <div className={`${styles.overlay} ${closing ? styles.overlayClosing : ''}`} onClick={onClose}>
      <div className={`${styles.modal} ${closing ? styles.closing : ''} ${closeButton ? styles.withClose : ''}`} onClick={(e) => e.stopPropagation()}>
        {posterPath && (
          <div className={styles.art} style={{ width: artWidth }}>
            {!fitsFrame && <Art path={posterPath} width={310} className={styles.backdrop} />}
            <Art
              path={posterPath}
              width={640}
              className={`${styles.poster} ${fitsFrame ? '' : styles.posterWhole}`}
              onRatio={setRatio}
            />
          </div>
        )}
        <div className={styles.body} ref={bodyRef} style={{ width: bodyWidth }}>
          {posterPath && (
            <div className={styles.wash}>
              <Art path={posterPath} width={310} className={styles.backdrop} />
            </div>
          )}
          <div className={styles.content}>{children}</div>
        </div>
        {closeButton && (
          <button className={styles.close} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Building blocks shared by the modals ─────────────────────────────────── */

export function Chips({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.chips}>{children}</div>
}

export function Chip({ accent, children }: { accent?: boolean; children: ReactNode }): JSX.Element {
  return <span className={`${styles.chip} ${accent ? styles.chipAccent : ''}`}>{children}</span>
}

export function Title({ children }: { children: ReactNode }): JSX.Element {
  return <h2 className={styles.title}>{children}</h2>
}

export function SectionLabel({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.sectionLabel}>{children}</div>
}

export function Tiles({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.tiles}>{children}</div>
}

export function Tile({ value, label, children }: { value: ReactNode; label: ReactNode; children?: ReactNode }): JSX.Element {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
      {children}
    </div>
  )
}

/** Pushes what follows to the bottom of the details column. */
export function Spacer(): JSX.Element {
  return <div className={styles.spacer} />
}

export function Actions({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.actions}>{children}</div>
}

export function PlayIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" fill="currentColor" />
    </svg>
  )
}

export function CloseIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function RestartIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a5 5 0 1 0 1.6-3.7" />
      <path d="M3 2.5v2.8h2.8" />
    </svg>
  )
}

interface ButtonProps {
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  /** Primary only: the amber "go ahead anyway" look. */
  warn?: boolean
  /** Ring shown while a controller has this button selected. */
  focused?: boolean
  autoFocus?: boolean
  buttonRef?: (el: HTMLButtonElement | null) => void
}

export function PrimaryButton({ onClick, children, disabled, warn, focused, autoFocus, buttonRef }: ButtonProps): JSX.Element {
  return (
    <button
      ref={buttonRef}
      className={`${warn ? styles.primaryWarn : styles.primary} ${focused ? styles.padFocus : ''}`}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ onClick, children, disabled, focused, buttonRef }: ButtonProps): JSX.Element {
  return (
    <button
      ref={buttonRef}
      className={`${styles.secondary} ${focused ? styles.padFocus : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
