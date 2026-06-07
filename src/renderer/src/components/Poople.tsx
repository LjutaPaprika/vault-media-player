import { useEffect, useRef, useState } from 'react'
import { POOPLE_WORDS } from './poople/poopleWords'
import { POOPLE_STARTS } from './poople/poopleStarts'

const TARGET = 'poop'
const WORD_LEN = 4
const BEST_KEY = 'poopleBest'

type Phase = 'playing' | 'won'

function diffByOne(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diffs = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diffs++
      if (diffs > 1) return false
    }
  }
  return diffs === 1
}

function pickStart(): string {
  return POOPLE_STARTS[Math.floor(Math.random() * POOPLE_STARTS.length)]
}

export default function Poople(): JSX.Element {
  const [path, setPath] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [phase, setPhase] = useState<Phase>('playing')
  const [best, setBest] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [shake, setShake] = useState(false)

  const pathScrollRef = useRef<HTMLDivElement | null>(null)
  const pathRef = useRef<string[]>([])
  const currentRef = useRef('')
  const phaseRef = useRef<Phase>('playing')
  const bestRef = useRef<number | null>(null)

  useEffect(() => {
    void window.api.settings.get(BEST_KEY, 'null').then((v) => {
      try {
        const n = JSON.parse(v) as number | null
        if (typeof n === 'number' && n > 0) {
          bestRef.current = n
          setBest(n)
        }
      } catch { /* ignore */ }
      startRound()
    })
  }, [])

  function startRound(): void {
    const start = pickStart()
    pathRef.current = [start]
    currentRef.current = ''
    phaseRef.current = 'playing'
    setPath([start])
    setCurrent('')
    setPhase('playing')
    setMessage('')
  }

  function flash(text: string): void {
    setMessage(text)
    setShake(true)
    setTimeout(() => setShake(false), 350)
    setTimeout(() => setMessage((cur) => (cur === text ? '' : cur)), 1800)
  }

  function submit(): void {
    const w = currentRef.current.toLowerCase()
    if (w.length !== WORD_LEN) { flash(`${WORD_LEN} letters`); return }
    if (!POOPLE_WORDS.has(w)) { flash('not in word list'); return }
    const prev = pathRef.current[pathRef.current.length - 1]
    if (w === prev) { flash('same as current'); return }
    if (!diffByOne(prev, w)) { flash('change exactly one letter'); return }
    pathRef.current = [...pathRef.current, w]
    currentRef.current = ''
    setPath(pathRef.current)
    setCurrent('')
    if (w === TARGET) {
      phaseRef.current = 'won'
      setPhase('won')
      const steps = pathRef.current.length - 1
      if (bestRef.current === null || steps < bestRef.current) {
        bestRef.current = steps
        setBest(steps)
        void window.api.settings.set(BEST_KEY, JSON.stringify(steps))
        setMessage(`new best — ${steps} steps!`)
      } else {
        setMessage(`reached in ${steps} steps`)
      }
    }
  }

  function undo(): void {
    if (phaseRef.current !== 'playing') return
    if (pathRef.current.length <= 1) return
    pathRef.current = pathRef.current.slice(0, -1)
    setPath(pathRef.current)
    currentRef.current = ''
    setCurrent('')
    setMessage('')
  }

  useEffect(() => {
    const el = pathScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [path])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (phaseRef.current !== 'playing') {
        if (e.key === 'Enter') {
          e.preventDefault()
          startRound()
        }
        return
      }
      const k = e.key
      if (k === 'Enter') {
        e.preventDefault()
        e.stopImmediatePropagation()
        submit()
      } else if (k === 'Backspace') {
        e.preventDefault()
        currentRef.current = currentRef.current.slice(0, -1)
        setCurrent(currentRef.current)
      } else if (/^[a-zA-Z]$/.test(k)) {
        if (currentRef.current.length >= WORD_LEN) return
        currentRef.current = currentRef.current + k.toLowerCase()
        setCurrent(currentRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const start = path[0] ?? ''
  const currentWord = path[path.length - 1] ?? ''
  const steps = Math.max(0, path.length - 1)

  function letterTiles(word: string, prev: string | null): JSX.Element {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: WORD_LEN }).map((_, i) => {
          const ch = (word[i] ?? ' ').toUpperCase()
          const matched = word[i] === TARGET[i]
          const changed = prev !== null && prev[i] !== word[i]
          let bg = '#11131a'
          let border = '#2a3146'
          let fg = '#8aa'
          if (matched) {
            bg = '#5a2a7a'
            border = '#9a5acf'
            fg = '#f3dfff'
          } else if (changed) {
            bg = 'transparent'
            border = '#5a7aaf'
            fg = '#cbd0ff'
          }
          return (
            <div key={i} style={{
              width: 36,
              height: 36,
              background: bg,
              border: `2px solid ${border}`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 18,
              color: fg,
            }}>
              {ch !== ' ' ? ch : ''}
            </div>
          )
        })}
      </div>
    )
  }

  function currentInputTiles(): JSX.Element {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: WORD_LEN }).map((_, i) => {
          const raw = current[i] ?? ''
          const ch = raw.toUpperCase()
          const prevCh = currentWord[i] ?? ''
          const filled = raw.length > 0
          const matched = filled && raw === TARGET[i]
          const changed = filled && raw !== prevCh
          let bg = '#11131a'
          let border = '#2a3146'
          let fg = filled ? '#cbd0ff' : '#3a4060'
          if (matched) {
            bg = '#5a2a7a'
            border = '#9a5acf'
            fg = '#f3dfff'
          } else if (changed) {
            bg = 'transparent'
            border = '#5a7aaf'
          }
          return (
            <div key={i} style={{
              width: 44,
              height: 44,
              background: bg,
              border: `2px solid ${border}`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 22,
              color: fg,
            }}>
              {ch || '_'}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{
      padding: '16px 20px 24px',
      color: '#cbd0ff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* Top bar */}
      <div style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12,
        color: '#8aa',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        <div>
          start <strong style={{ color: '#cbd0ff', fontFamily: 'monospace' }}>{start.toUpperCase()}</strong>
          {'  '}→{'  '}
          target <strong style={{ color: '#e9a8ff', fontFamily: 'monospace' }}>POOP</strong>
        </div>
        <div>
          steps {steps} · best {best ?? '—'}
        </div>
      </div>

      {/* Path */}
      <div ref={pathScrollRef} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'center',
        maxHeight: 280,
        overflowY: 'auto',
        padding: 8,
      }}>
        {path.map((w, i) => letterTiles(w, i > 0 ? path[i - 1] : null))}
      </div>

      {/* Input */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
        animation: shake ? 'poopShake 0.35s' : undefined,
      }}>
        <div style={{ fontSize: 11, color: '#5b6480', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          next word (change one letter)
        </div>
        {currentInputTiles()}
      </div>

      {/* Status */}
      <div style={{
        height: 20,
        fontSize: 13,
        color: phase === 'won' ? '#8ee9a4' : '#8aa',
        letterSpacing: '0.04em',
      }}>
        {message || (phase === 'playing'
          ? 'Enter to submit · Backspace to edit'
          : 'press Enter for a new start')}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={undo} disabled={phase !== 'playing' || path.length <= 1} style={{
          background: 'transparent',
          color: '#cbd0ff',
          border: '1px solid #2a3146',
          borderRadius: 6,
          padding: '6px 14px',
          fontSize: 12,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: phase !== 'playing' || path.length <= 1 ? 'not-allowed' : 'pointer',
          opacity: phase !== 'playing' || path.length <= 1 ? 0.4 : 1,
        }}>
          undo
        </button>
        <button onClick={startRound} style={{
          background: 'transparent',
          color: '#cbd0ff',
          border: '1px solid #2a3146',
          borderRadius: 6,
          padding: '6px 14px',
          fontSize: 12,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}>
          new start
        </button>
      </div>

      <style>{`
        @keyframes poopShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}
