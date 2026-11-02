import { useEffect, useMemo, useRef, useState } from 'react'
import PosterImage from './PosterImage'
import { useController } from '../hooks/useController'
import { checkPlaylistName, type PlaylistTarget } from '../utils/playlistTarget'
import styles from './PlaylistPicker.module.css'

/**
 * Where a YouTube download goes: a visible list of the playlists already on
 * the drive (cover, name, size), a "New playlist" row that takes a name in
 * place, and, on the YouTube page, "No playlist". Shared by the YouTube and
 * Music download modals.
 *
 * Opened from inside a playlist, it starts collapsed onto that one playlist
 * ("Adding to Meme · Change") so the common case needs no choosing at all.
 */

export interface PickerPlaylist {
  name: string
  cover?: { path: string; width: number } | null
  /** e.g. "14 videos · 52m" or "17 tracks". */
  detail: string
}

interface Props {
  playlists: PickerPlaylist[]
  value: PlaylistTarget
  onChange: (target: PlaylistTarget) => void
  /** Offer "No playlist" (the YouTube page's loose videos). */
  allowNone?: boolean
  /** Cover shape: video thumbnails are wide, music art is square. */
  coverShape: 'wide' | 'square'
  /** Start collapsed onto the chosen existing playlist. */
  startCollapsed?: boolean
}

const SEARCH_FROM = 8

type Row = { key: string; target: PlaylistTarget }

export default function PlaylistPicker({ playlists, value, onChange, allowNone = false, coverShape, startCollapsed = false }: Props): JSX.Element {
  const [collapsed, setCollapsed] = useState(startCollapsed && value.kind === 'existing')
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState(value.kind === 'new' ? value.name : '')
  const listRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const names = useMemo(() => playlists.map((p) => p.name), [playlists])
  const q = query.trim().toLowerCase()
  const shown = q ? playlists.filter((p) => p.name.toLowerCase().includes(q)) : playlists

  // Rows in the order they are listed, for arrow keys and the controller.
  const rows: Row[] = [
    { key: '__new__', target: { kind: 'new', name: newName } },
    ...(allowNone ? [{ key: '__none__', target: { kind: 'none' } as PlaylistTarget }] : []),
    ...shown.map((p) => ({ key: p.name, target: { kind: 'existing', name: p.name } as PlaylistTarget }))
  ]
  const selectedKey = value.kind === 'new' ? '__new__' : value.kind === 'none' ? '__none__' : value.name
  const selectedIndex = rows.findIndex((r) => r.key === selectedKey)

  function select(row: Row): void {
    onChange(row.target)
  }

  function move(delta: number): void {
    if (rows.length === 0) return
    const from = selectedIndex === -1 ? (delta > 0 ? -1 : rows.length) : selectedIndex
    const next = rows[Math.max(0, Math.min(rows.length - 1, from + delta))]
    select(next)
  }

  // Keep the chosen row in view as the selection moves.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedKey])

  // Typing a name: focus the field when "New playlist" is chosen, but not on
  // opening, where the link field above has the focus.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current && value.kind === 'new' && !collapsed) nameRef.current?.focus()
    mounted.current = true
  }, [value.kind, collapsed])

  useController({
    enabled: !collapsed,
    onButton: (btn) => {
      if (btn === 'up') move(-1)
      if (btn === 'down') move(1)
    }
  })

  const check = value.kind === 'new' && newName.trim() ? checkPlaylistName(newName, names) : null

  if (collapsed && value.kind === 'existing') {
    const p = playlists.find((x) => x.name === value.name)
    return (
      <div className={styles.collapsed}>
        <Cover playlist={p} name={value.name} shape={coverShape} />
        <div className={styles.text}>
          <span className={styles.name}>{value.name}</span>
          {p && <span className={styles.detail}>{p.detail}</span>}
        </div>
        <button type="button" className={styles.changeBtn} onClick={() => setCollapsed(false)}>Change</button>
      </div>
    )
  }

  return (
    <div className={styles.picker}>
      {playlists.length >= SEARCH_FROM && (
        <input
          className={styles.search}
          placeholder="Find a playlist…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
            if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
          }}
        />
      )}
      <div
        ref={listRef}
        className={styles.list}
        role="radiogroup"
        aria-label="Playlist"
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') return
          if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
          if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
        }}
      >
        {/* New playlist: the name is typed right in the row. */}
        <div className={`${styles.row} ${selectedKey === '__new__' ? styles.rowSelected : ''}`}>
          <button
            type="button"
            role="radio"
            aria-checked={selectedKey === '__new__'}
            className={styles.rowBtn}
            onClick={() => select(rows[0])}
          >
            <span className={`${styles.cover} ${styles[coverShape]} ${styles.iconCover}`}><PlusIcon /></span>
            <span className={styles.text}>
              <span className={styles.name}>New playlist</span>
              {selectedKey !== '__new__' && <span className={styles.detail}>Make a playlist for these</span>}
            </span>
            <span className={styles.radio} />
          </button>
          {selectedKey === '__new__' && (
            <div className={`${styles.newBody} ${coverShape === 'square' ? styles.newBodySquare : ''}`}>
              <input
                ref={nameRef}
                className={styles.nameInput}
                placeholder="Playlist name"
                value={newName}
                maxLength={120}
                onChange={(e) => { setNewName(e.target.value); onChange({ kind: 'new', name: e.target.value }) }}
              />
              {check && !check.ok && 'error' in check && <p className={styles.problem}>{check.error}</p>}
              {check && !check.ok && 'existing' in check && (
                <p className={styles.problem}>
                  You already have a playlist called “{check.existing}”.{' '}
                  <button type="button" className={styles.linkBtn} onClick={() => onChange({ kind: 'existing', name: check.existing })}>
                    Add to it instead
                  </button>
                </p>
              )}
            </div>
          )}
        </div>

        {allowNone && (
          <button
            type="button"
            role="radio"
            aria-checked={selectedKey === '__none__'}
            className={`${styles.row} ${styles.rowBtn} ${selectedKey === '__none__' ? styles.rowSelected : ''}`}
            onClick={() => onChange({ kind: 'none' })}
          >
            <span className={`${styles.cover} ${styles[coverShape]} ${styles.iconCover}`}><LooseIcon /></span>
            <span className={styles.text}>
              <span className={styles.name}>No playlist</span>
              <span className={styles.detail}>Saved on its own, under Videos</span>
            </span>
            <span className={styles.radio} />
          </button>
        )}

        {shown.map((p) => (
          <button
            key={p.name}
            type="button"
            role="radio"
            aria-checked={selectedKey === p.name}
            className={`${styles.row} ${styles.rowBtn} ${selectedKey === p.name ? styles.rowSelected : ''}`}
            onClick={() => onChange({ kind: 'existing', name: p.name })}
          >
            <Cover playlist={p} name={p.name} shape={coverShape} />
            <span className={styles.text}>
              <span className={styles.name}>{p.name}</span>
              <span className={styles.detail}>{p.detail}</span>
            </span>
            <span className={styles.radio} />
          </button>
        ))}

        {q && shown.length === 0 && (
          <p className={styles.empty}>No playlist matches “{query.trim()}”.</p>
        )}
      </div>
    </div>
  )
}

function Cover({ playlist, name, shape }: { playlist?: PickerPlaylist; name: string; shape: 'wide' | 'square' }): JSX.Element {
  return (
    <span className={`${styles.cover} ${styles[shape]}`}>
      {playlist?.cover
        ? <PosterImage filePath={playlist.cover.path} title={name} width={playlist.cover.width} />
        : <span className={styles.coverLetter}>{name.charAt(0)}</span>}
    </span>
  )
}

function PlusIcon(): JSX.Element {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
}

function LooseIcon(): JSX.Element {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
}
