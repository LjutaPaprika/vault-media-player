import { useEffect, useRef, useState } from 'react'
import { WORDLE_WORDS } from './wordleWords'
import { WORDLE_GUESS_SET } from './wordleGuesses'
import styles from './Wordle.module.css'

const SAVE_KEY = 'wordleStats'
const PLAYED_KEY = 'wordlePlayed'
const MAX_GUESSES = 6
const WORD_LEN = 5

type LetterState = 'correct' | 'present' | 'absent' | 'empty' | 'pending'
type Phase = 'playing' | 'won' | 'lost'

interface Stats {
  played: number
  wins: number
  streak: number
  bestStreak: number
  guessDist: number[] // index 0 = 1 guess, ..., index 5 = 6 guesses
}

const INITIAL_STATS: Stats = {
  played: 0,
  wins: 0,
  streak: 0,
  bestStreak: 0,
  guessDist: [0, 0, 0, 0, 0, 0]
}

function evaluateGuess(guess: string, target: string): LetterState[] {
  const result: LetterState[] = Array(WORD_LEN).fill('absent')
  const targetChars = target.split('')
  // First pass: correct positions
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === targetChars[i]) {
      result[i] = 'correct'
      targetChars[i] = '*' // consume
    }
  }
  // Second pass: present (right letter, wrong position)
  for (let i = 0; i < WORD_LEN; i++) {
    if (result[i] === 'correct') continue
    const idx = targetChars.indexOf(guess[i])
    if (idx >= 0) {
      result[i] = 'present'
      targetChars[idx] = '*'
    }
  }
  return result
}

export default function Wordle(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('playing')
  const [target, setTarget] = useState('')
  const [guesses, setGuesses] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [stats, setStats] = useState<Stats>(INITIAL_STATS)
  const [shake, setShake] = useState(false)
  const [revealRow, setRevealRow] = useState(-1)

  const playedRef = useRef<Set<string>>(new Set())
  const phaseRef = useRef<Phase>('playing')
  const targetRef = useRef('')
  const guessesRef = useRef<string[]>([])
  const currentRef = useRef('')
  const statsRef = useRef<Stats>(INITIAL_STATS)

  useEffect(() => {
    Promise.all([
      window.api.settings.get(SAVE_KEY, '{}'),
      window.api.settings.get(PLAYED_KEY, '[]')
    ]).then(([statsJson, playedJson]) => {
      try {
        const s = JSON.parse(statsJson) as Partial<Stats>
        statsRef.current = {
          played: s.played ?? 0,
          wins: s.wins ?? 0,
          streak: s.streak ?? 0,
          bestStreak: s.bestStreak ?? 0,
          guessDist: s.guessDist ?? [0, 0, 0, 0, 0, 0]
        }
        setStats(statsRef.current)
      } catch { /* defaults */ }
      try {
        const arr = JSON.parse(playedJson) as string[]
        playedRef.current = new Set(arr)
      } catch { /* defaults */ }
      pickTarget()
    })
  }, [])

  function pickTarget(): void {
    let pool = WORDLE_WORDS.filter((w) => !playedRef.current.has(w))
    if (pool.length === 0) {
      // Exhausted — reset the played list (true endless wraparound)
      playedRef.current = new Set()
      pool = [...WORDLE_WORDS]
    }
    const word = pool[Math.floor(Math.random() * pool.length)]
    targetRef.current = word
    setTarget(word)
    guessesRef.current = []
    currentRef.current = ''
    setGuesses([])
    setCurrent('')
    phaseRef.current = 'playing'
    setPhase('playing')
    setRevealRow(-1)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (phaseRef.current !== 'playing') return
      const key = e.key
      if (key === 'Enter') {
        e.preventDefault()
        e.stopImmediatePropagation()
        submitGuess()
      } else if (key === 'Backspace') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (currentRef.current.length > 0) {
          currentRef.current = currentRef.current.slice(0, -1)
          setCurrent(currentRef.current)
        }
      } else if (/^[a-zA-Z]$/.test(key) && currentRef.current.length < WORD_LEN) {
        e.preventDefault()
        e.stopImmediatePropagation()
        currentRef.current = currentRef.current + key.toLowerCase()
        setCurrent(currentRef.current)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  function submitGuess(): void {
    const guess = currentRef.current
    if (guess.length !== WORD_LEN) {
      flashShake()
      return
    }
    // Validate against the canonical ~14.8k Wordle guess list. Curated answer
    // pool is a subset, so any answer is always a valid guess.
    if (!WORDLE_GUESS_SET.has(guess)) {
      flashShake()
      return
    }

    const rowIdx = guessesRef.current.length
    guessesRef.current = [...guessesRef.current, guess]
    setGuesses(guessesRef.current)
    currentRef.current = ''
    setCurrent('')
    setRevealRow(rowIdx)

    if (guess === targetRef.current) {
      // Stagger phase transition to let reveal animation play
      setTimeout(() => {
        phaseRef.current = 'won'
        setPhase('won')
        recordResult(true, rowIdx)
      }, WORD_LEN * 280 + 100)
    } else if (guessesRef.current.length >= MAX_GUESSES) {
      setTimeout(() => {
        phaseRef.current = 'lost'
        setPhase('lost')
        recordResult(false, -1)
      }, WORD_LEN * 280 + 100)
    }
  }

  function flashShake(): void {
    setShake(true)
    setTimeout(() => setShake(false), 350)
  }

  function recordResult(won: boolean, guessIdx: number): void {
    const s = { ...statsRef.current, guessDist: [...statsRef.current.guessDist] }
    s.played++
    if (won) {
      s.wins++
      s.streak++
      if (s.streak > s.bestStreak) s.bestStreak = s.streak
      if (guessIdx >= 0 && guessIdx < 6) s.guessDist[guessIdx]++
    } else {
      s.streak = 0
    }
    statsRef.current = s
    setStats(s)
    window.api.settings.set(SAVE_KEY, JSON.stringify(s)).catch(() => {})
    // Track played word so next round avoids it
    playedRef.current.add(targetRef.current)
    window.api.settings.set(PLAYED_KEY, JSON.stringify([...playedRef.current])).catch(() => {})
  }

  function cellState(row: number, col: number): LetterState {
    if (row < guesses.length) {
      return evaluateGuess(guesses[row], target)[col]
    }
    if (row === guesses.length && col < current.length) return 'pending'
    return 'empty'
  }

  function cellChar(row: number, col: number): string {
    if (row < guesses.length) return guesses[row][col].toUpperCase()
    if (row === guesses.length) return (current[col] ?? '').toUpperCase()
    return ''
  }

  // Compute keyboard letter states from past guesses (correct > present > absent)
  const keyStates: Record<string, LetterState> = {}
  for (const g of guesses) {
    const eval_ = evaluateGuess(g, target)
    for (let i = 0; i < WORD_LEN; i++) {
      const letter = g[i]
      const newState = eval_[i]
      const prev = keyStates[letter]
      if (prev === 'correct') continue
      if (prev === 'present' && newState === 'absent') continue
      keyStates[letter] = newState
    }
  }

  const KEYBOARD = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
  const remainingPool = WORDLE_WORDS.length - playedRef.current.size

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span>Streak <strong>{stats.streak}</strong></span>
        <span>Best <strong>{stats.bestStreak}</strong></span>
        <span>Played <strong>{stats.played}</strong></span>
        <span className={styles.best}>{remainingPool} words left in pool</span>
      </div>
      <div className={`${styles.board} ${shake ? styles.shake : ''}`}>
        {Array.from({ length: MAX_GUESSES }).map((_, row) => (
          <div key={row} className={styles.row}>
            {Array.from({ length: WORD_LEN }).map((_, col) => {
              const state = cellState(row, col)
              const isReveal = row === revealRow
              return (
                <div
                  key={col}
                  className={`${styles.cell} ${styles[state]} ${isReveal ? styles.reveal : ''}`}
                  style={isReveal ? { animationDelay: `${col * 280}ms` } : undefined}
                >
                  {cellChar(row, col)}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className={styles.keyboard}>
        {KEYBOARD.map((row, i) => (
          <div key={i} className={styles.keyRow}>
            {i === 2 && (
              <button className={`${styles.key} ${styles.wide}`} onClick={() => submitGuess()}>
                ENTER
              </button>
            )}
            {row.split('').map((letter) => (
              <button
                key={letter}
                className={`${styles.key} ${styles[keyStates[letter] ?? 'empty']}`}
                onClick={() => {
                  if (phaseRef.current !== 'playing') return
                  if (currentRef.current.length < WORD_LEN) {
                    currentRef.current = currentRef.current + letter
                    setCurrent(currentRef.current)
                  }
                }}
              >
                {letter.toUpperCase()}
              </button>
            ))}
            {i === 2 && (
              <button className={`${styles.key} ${styles.wide}`} onClick={() => {
                if (phaseRef.current !== 'playing') return
                if (currentRef.current.length > 0) {
                  currentRef.current = currentRef.current.slice(0, -1)
                  setCurrent(currentRef.current)
                }
              }}>
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>
      {phase !== 'playing' && (
        <div className={styles.endBanner}>
          <span className={styles.endTitle}>
            {phase === 'won' ? '🎉 Solved!' : `💀 The word was ${target.toUpperCase()}`}
          </span>
          <button className={styles.btn} onClick={pickTarget}>Next Word</button>
        </div>
      )}
    </div>
  )
}
