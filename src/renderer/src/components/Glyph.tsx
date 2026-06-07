import { useEffect, useRef, useState } from 'react'
import LetterGlyph from './glyph/LetterGlyph'
import StackedGlyph, { StackedLetter } from './glyph/StackedGlyph'
import { WORDLE_WORDS } from './wordleWords'
import { WORDLE_GUESS_SET } from './wordleGuesses'
import { GLYPH6_WORDS } from './glyph/glyph6Words'
import { GLYPH6_GUESSES } from './glyph/glyph6Guesses'
import {
  LetterState,
  assignPuzzleColors,
  evaluateGuess,
  computeRevealState,
} from './glyph/glyphLogic'

type Mode = 5 | 6
type Phase = 'playing' | 'won' | 'lost'

const MAX_GUESSES = 5
const WHITE = '#ffffff'

const PLAYED_KEY = (mode: Mode): string => `glyphPlayed${mode}`
const STATS_KEY = 'glyphStats'

interface Stats {
  played: number
  wins: number
  streak: number
  bestStreak: number
}

const INITIAL_STATS: Stats = { played: 0, wins: 0, streak: 0, bestStreak: 0 }

function pickFromPool(words: readonly string[], played: Set<string>): { word: string; reset: boolean } {
  let pool = words.filter((w) => !played.has(w))
  let reset = false
  if (pool.length === 0) {
    played.clear()
    pool = [...words]
    reset = true
  }
  return { word: pool[Math.floor(Math.random() * pool.length)], reset }
}

function wordsForMode(mode: Mode): readonly string[] {
  return mode === 5 ? WORDLE_WORDS : GLYPH6_WORDS
}
function isValidGuess(word: string, mode: Mode): boolean {
  if (word.length !== mode) return false
  return mode === 5 ? WORDLE_GUESS_SET.has(word) : GLYPH6_GUESSES.has(word)
}

export default function Glyph(): JSX.Element {
  const [mode, setMode] = useState<Mode>(5)
  const [target, setTarget] = useState('')
  const [colorMap, setColorMap] = useState<Record<string, string>>({})
  const [guesses, setGuesses] = useState<string[]>([])
  const [evaluations, setEvaluations] = useState<LetterState[][]>([])
  const [current, setCurrent] = useState('')
  const [phase, setPhase] = useState<Phase>('playing')
  const [stats, setStats] = useState<Stats>(INITIAL_STATS)
  const [message, setMessage] = useState('')
  const [shake, setShake] = useState(false)
  const [celebration, setCelebration] = useState<'idle' | 'stacking' | 'fadeout'>('idle')

  const phaseRef = useRef<Phase>('playing')
  const targetRef = useRef('')
  const guessesRef = useRef<string[]>([])
  const evalRef = useRef<LetterState[][]>([])
  const currentRef = useRef('')
  const modeRef = useRef<Mode>(5)
  const played5Ref = useRef<Set<string>>(new Set())
  const played6Ref = useRef<Set<string>>(new Set())
  const statsRef = useRef<Stats>(INITIAL_STATS)
  const colorMapRef = useRef<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      window.api.settings.get(STATS_KEY, '{}'),
      window.api.settings.get(PLAYED_KEY(5), '[]'),
      window.api.settings.get(PLAYED_KEY(6), '[]'),
    ]).then(([statsJson, p5Json, p6Json]) => {
      try {
        const s = JSON.parse(statsJson) as Partial<Stats>
        statsRef.current = {
          played: s.played ?? 0,
          wins: s.wins ?? 0,
          streak: s.streak ?? 0,
          bestStreak: s.bestStreak ?? 0,
        }
        setStats(statsRef.current)
      } catch { /* defaults */ }
      try { played5Ref.current = new Set(JSON.parse(p5Json) as string[]) } catch { /* ignore */ }
      try { played6Ref.current = new Set(JSON.parse(p6Json) as string[]) } catch { /* ignore */ }
      newRound(modeRef.current)
    })
  }, [])

  function newRound(m: Mode): void {
    const playedSet = m === 5 ? played5Ref.current : played6Ref.current
    const { word } = pickFromPool(wordsForMode(m), playedSet)
    targetRef.current = word
    setTarget(word)
    const colors = assignPuzzleColors(word)
    colorMapRef.current = colors
    setColorMap(colors)
    guessesRef.current = []
    evalRef.current = []
    currentRef.current = ''
    setGuesses([])
    setEvaluations([])
    setCurrent('')
    phaseRef.current = 'playing'
    setPhase('playing')
    setMessage('')
  }

  function switchMode(m: Mode): void {
    if (m === modeRef.current) return
    modeRef.current = m
    setMode(m)
    newRound(m)
  }

  function flashMessage(text: string): void {
    setMessage(text)
    setShake(true)
    setTimeout(() => setShake(false), 350)
    setTimeout(() => setMessage((cur) => (cur === text ? '' : cur)), 1800)
  }

  function persistPlayed(m: Mode): void {
    const set = m === 5 ? played5Ref.current : played6Ref.current
    void window.api.settings.set(PLAYED_KEY(m), JSON.stringify(Array.from(set)))
  }

  function persistStats(): void {
    void window.api.settings.set(STATS_KEY, JSON.stringify(statsRef.current))
  }

  function submitGuess(): void {
    const m = modeRef.current
    const g = currentRef.current.toUpperCase()
    if (g.length !== m) {
      flashMessage(`${m} letters`)
      return
    }
    if (!isValidGuess(g.toLowerCase(), m)) {
      flashMessage('not in word list')
      return
    }
    const ev = evaluateGuess(g, targetRef.current)
    guessesRef.current = [...guessesRef.current, g]
    evalRef.current = [...evalRef.current, ev]
    currentRef.current = ''
    setGuesses(guessesRef.current)
    setEvaluations(evalRef.current)
    setCurrent('')

    const won = ev.every((s) => s === 'decoded')
    if (won) {
      phaseRef.current = 'won'
      setPhase('won')
      const playedSet = m === 5 ? played5Ref.current : played6Ref.current
      playedSet.add(targetRef.current.toLowerCase())
      persistPlayed(m)
      statsRef.current = {
        played: statsRef.current.played + 1,
        wins: statsRef.current.wins + 1,
        streak: statsRef.current.streak + 1,
        bestStreak: Math.max(statsRef.current.bestStreak, statsRef.current.streak + 1),
      }
      setStats(statsRef.current)
      persistStats()
      setMessage('decoded!')
      // Win celebration: pause, stack letters in angled view, fade, next puzzle.
      const len = targetRef.current.length
      const PAUSE = 500
      const PER_LETTER = 180
      const LAND = 450
      const HOLD = 700
      const FADE = 400
      const stackingDuration = (len - 1) * PER_LETTER + LAND
      setTimeout(() => setCelebration('stacking'), PAUSE)
      setTimeout(() => setCelebration('fadeout'), PAUSE + stackingDuration + HOLD)
      setTimeout(() => {
        setCelebration('idle')
        newRound(modeRef.current)
      }, PAUSE + stackingDuration + HOLD + FADE)
    } else if (guessesRef.current.length >= MAX_GUESSES) {
      phaseRef.current = 'lost'
      setPhase('lost')
      const playedSet = m === 5 ? played5Ref.current : played6Ref.current
      playedSet.add(targetRef.current.toLowerCase())
      persistPlayed(m)
      statsRef.current = {
        played: statsRef.current.played + 1,
        wins: statsRef.current.wins,
        streak: 0,
        bestStreak: statsRef.current.bestStreak,
      }
      setStats(statsRef.current)
      persistStats()
      setMessage(`it was ${targetRef.current.toUpperCase()}`)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (phaseRef.current !== 'playing') {
        if (e.key === 'Enter') {
          e.preventDefault()
          newRound(modeRef.current)
        }
        return
      }
      const k = e.key
      if (k === 'Enter') {
        e.preventDefault()
        e.stopImmediatePropagation()
        submitGuess()
      } else if (k === 'Backspace') {
        e.preventDefault()
        currentRef.current = currentRef.current.slice(0, -1)
        setCurrent(currentRef.current)
      } else if (/^[a-zA-Z]$/.test(k)) {
        if (currentRef.current.length >= modeRef.current) return
        currentRef.current = currentRef.current + k.toUpperCase()
        setCurrent(currentRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reveal = computeRevealState(guesses, evaluations, target)

  // Target glyph: hide letters whose target position has been decoded; color
  // any letter known to be in the target word.
  const targetStack: StackedLetter[] = target
    .toUpperCase()
    .split('')
    .map((ch, i) => ({
      letter: ch,
      color: reveal.found.has(ch) ? colorMap[ch] ?? WHITE : WHITE,
      visible: !reveal.decodedPositions.has(i),
    }))

  // Input glyph: live preview of what the player is typing. Always rendered
  // in white so palette membership is never leaked before the guess commits.
  const inputStack: StackedLetter[] = current.split('').map((ch) => ({
    letter: ch.toUpperCase(),
    color: WHITE,
  }))

  const remaining = MAX_GUESSES - guesses.length

  return (
    <div style={{
      position: 'relative',
      padding: '16px 20px 24px',
      color: '#cbd0ff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 14,
    }}>
      {/* Mode toggle + stats */}
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
        <div style={{ display: 'flex', gap: 6 }}>
          {([5, 6] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                background: mode === m ? '#2a3a5a' : 'transparent',
                color: mode === m ? '#cbd0ff' : '#5b6480',
                border: '1px solid #2a3146',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              {m} letters
            </button>
          ))}
        </div>
        <div>
          played {stats.played} · wins {stats.wins} · streak {stats.streak} · best {stats.bestStreak}
        </div>
      </div>

      {/* Status line */}
      <div style={{
        height: 20,
        fontSize: 13,
        color: phase === 'won' ? '#8ee9a4' : phase === 'lost' ? '#e98e8e' : '#8aa',
        letterSpacing: '0.04em',
      }}>
        {message || (phase === 'playing'
          ? `${remaining} guess${remaining === 1 ? '' : 'es'} left`
          : 'press Enter for a new word')}
      </div>

      {/* Three panels side by side: Target | Your glyph | Decoding */}
      <div style={{
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {/* Target */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#5b6480', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Target glyph
          </div>
          <div style={{
            background: '#0d0f17',
            border: '1px solid #2a3146',
            borderRadius: 12,
            padding: 18,
            animation: shake ? 'glyphShake 0.35s' : undefined,
          }}>
            <StackedGlyph letters={targetStack} size={220} strokeWidth={5} />
          </div>
        </div>

        {/* Your glyph */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#5b6480', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Your glyph
          </div>
          <div style={{
            background: '#0d0f17',
            border: '1px solid #2a3146',
            borderRadius: 12,
            padding: 18,
            width: 256,
            height: 256,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {inputStack.length > 0
              ? <StackedGlyph letters={inputStack} size={220} strokeWidth={5} />
              : <div style={{ fontSize: 11, color: '#3a4060', letterSpacing: '0.1em' }}>type letters</div>}
          </div>
        </div>

        {/* Decoding output */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#5b6480', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Decoding
          </div>
          <div style={{
            background: '#0d0f17',
            border: '1px solid #2a3146',
            borderRadius: 12,
            padding: 18,
            width: 256,
            height: 256,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {Array.from({ length: MAX_GUESSES }).map((_, row) => {
              const submitted = row < guesses.length
              const isCurrent = row === guesses.length && phase === 'playing'
              const word = submitted ? guesses[row] : isCurrent ? current.padEnd(mode, ' ') : ''.padEnd(mode, ' ')
              const ev = submitted ? evaluations[row] : null
              return (
                <div key={row} style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: mode }).map((_, col) => {
                    const ch = word[col] ?? ' '
                    const state = ev?.[col]
                    let bg = '#11131a'
                    let border = '#2a3146'
                    let fg = '#cbd0ff'
                    if (state === 'decoded') {
                      bg = colorMap[ch] ?? '#3a6a3a'
                      border = bg
                      fg = '#0d0f17'
                    } else if (state === 'found') {
                      bg = 'transparent'
                      border = colorMap[ch] ?? '#aa8a3a'
                      fg = colorMap[ch] ?? '#cbd0ff'
                    } else if (state === 'absent') {
                      bg = '#1a1c24'
                      border = '#2a3146'
                      fg = '#5b6480'
                    }
                    return (
                      <div key={col} style={{
                        width: 38,
                        height: 38,
                        background: bg,
                        border: `2px solid ${border}`,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 18,
                        color: fg,
                        fontFamily: 'monospace',
                        transition: 'background 0.2s, border-color 0.2s, color 0.2s',
                      }}>
                        {ch !== ' ' ? ch : ''}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Win-celebration overlay: dim playspace, stack target letters in 3D */}
      {celebration !== 'idle' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(8, 10, 16, 0.86)',
          backdropFilter: 'blur(2px)',
          transition: 'opacity 0.4s ease-out',
          opacity: celebration === 'fadeout' ? 0 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
          pointerEvents: 'none',
          borderRadius: 12,
        }}>
          <div style={{ perspective: '900px' }}>
            <div style={{
              transform: 'rotateX(-32deg)',
              transformStyle: 'preserve-3d',
              position: 'relative',
              width: 280,
              height: 280,
            }}>
              {target.toUpperCase().split('').map((ch, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  inset: 0,
                  transformStyle: 'preserve-3d',
                  transform: `translateZ(${(target.length - 1 - i) * 14}px)`,
                }}>
                  <div style={{
                    opacity: 0,
                    animation: `glyphLand 0.45s ${i * 180}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                  }}>
                    <LetterGlyph
                      letter={ch}
                      color={colorMap[ch] ?? WHITE}
                      size={280}
                      strokeWidth={5}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes glyphShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes glyphLand {
          0% { opacity: 0; transform: translateY(-180px) scale(1.15); }
          70% { opacity: 1; }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
