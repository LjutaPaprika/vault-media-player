import { useEffect } from 'react'
import { useController } from '../hooks/useController'
import PosterModal, {
  Actions, Chip, Chips, CloseIcon, PlayIcon, PrimaryButton, SecondaryButton,
  SectionLabel, Spacer, Tile, Tiles, Title
} from './PosterModal'
import styles from './GameLaunchModal.module.css'

export type Status = 'ok' | 'warn' | 'fail' | 'info'

export interface CompareRow {
  label: string
  required: string
  actual: string
  status: Status
}

interface Props {
  title: string
  platform: string
  emulator: string | null
  playtime: string | null
  posterPath: string | null
  comparison: CompareRow[] | null
  warning: string | null
  launchError: string | null
  hasFail: boolean
  closing: boolean
  onCancel: () => void
  onLaunch: () => void
}

function StatusIcon({ status }: { status: Status }): JSX.Element {
  return (
    <span className={`${styles.statusIcon} ${styles[`s_${status}`]}`} aria-hidden>
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {status === 'ok'   && <path d="M3.5 8.5l3 3 6-7" />}
        {status === 'warn' && <><path d="M8 4v5" /><path d="M8 12h.01" /></>}
        {status === 'fail' && <><path d="M4.5 4.5l7 7" /><path d="M11.5 4.5l-7 7" /></>}
        {status === 'info' && <path d="M8 8h.01" strokeWidth="4" />}
      </svg>
    </span>
  )
}

/** Each spec as one line: what you have, with what's required underneath. */
function SpecList({ rows }: { rows: CompareRow[] | null }): JSX.Element {
  if (!rows) return <p className={styles.detecting}>Detecting system specs…</p>
  return (
    <ul className={styles.specList}>
      {rows.map((r) => (
        <li key={r.label} className={styles.spec}>
          <StatusIcon status={r.status} />
          <span className={styles.specLabel}>{r.label}</span>
          <span className={styles.specBody}>
            <span className={styles.specActual}>{r.actual}</span>
            <span className={styles.specReq}>Required: {r.required}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function overallStatus(rows: CompareRow[] | null): { status: Status; text: string } {
  if (!rows) return { status: 'info', text: 'Checking your system…' }
  if (rows.some((r) => r.status === 'fail')) return { status: 'fail', text: 'This PC may not run it' }
  if (rows.some((r) => r.status === 'warn')) return { status: 'warn', text: 'Some specs are below recommended' }
  return { status: 'ok', text: 'Ready to play on this PC' }
}

/** Launch confirmation for a game: cover, playtime and a system check. */
export default function GameLaunchModal(p: Props): JSX.Element {
  const overall = overallStatus(p.comparison)

  // A gamepad: A plays, B closes.
  const { resetState } = useController({ onButton: (btn) => {
    if (btn === 'confirm') p.onLaunch()
    if (btn === 'back') p.onCancel()
  } })
  // Swallow the press that opened the modal so it doesn't launch the game too.
  useEffect(() => { resetState() }, [])

  return (
    <PosterModal posterPath={p.posterPath} closing={p.closing} onClose={p.onCancel}>
      <Title>{p.title}</Title>
      <Chips>
        <Chip accent>{p.platform}</Chip>
        {p.emulator && <Chip>{p.emulator}</Chip>}
      </Chips>
      <Tiles>
        <Tile value={p.playtime ?? '—'} label={p.playtime ? 'Played' : 'Not played yet'} />
        <Tile value={<StatusIcon status={overall.status} />} label={overall.text} />
      </Tiles>
      <SectionLabel>System check</SectionLabel>
      <SpecList rows={p.comparison} />
      {p.warning && <div className={styles.notice}>{p.warning}</div>}
      {p.launchError && <div className={`${styles.notice} ${styles.noticeError}`}>{p.launchError}</div>}
      <Spacer />
      <Actions>
        <SecondaryButton onClick={p.onCancel}><CloseIcon />Cancel</SecondaryButton>
        <PrimaryButton onClick={p.onLaunch} warn={p.hasFail} autoFocus>
          <PlayIcon />
          {p.hasFail ? 'Launch anyway' : 'Play'}
        </PrimaryButton>
      </Actions>
    </PosterModal>
  )
}
