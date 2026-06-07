// Pure game logic for Glyph: guess evaluation, per-puzzle color assignment.

export type LetterState = 'decoded' | 'found' | 'absent'

// Vibrant palette tuned for dark background. Shuffled per puzzle and
// assigned to the answer's unique letters in first-appearance order.
const PALETTE: readonly string[] = [
  'hsl(195, 90%, 60%)', // cyan-blue
  'hsl(330, 85%, 65%)', // pink
  'hsl(45, 95%, 60%)',  // yellow
  'hsl(135, 70%, 55%)', // green
  'hsl(280, 80%, 70%)', // purple
  'hsl(15, 90%, 62%)',  // orange-red
  'hsl(170, 75%, 55%)', // teal
  'hsl(60, 80%, 65%)',  // chartreuse
]

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Assigns each unique letter of `target` a color from a freshly shuffled palette.
 * Letters not in the target are not in the returned map (callers should fall back
 * to white).
 */
export function assignPuzzleColors(target: string): Record<string, string> {
  const palette = shuffle(PALETTE)
  const seen: string[] = []
  for (const ch of target.toUpperCase()) {
    if (!seen.includes(ch)) seen.push(ch)
  }
  const map: Record<string, string> = {}
  seen.forEach((ch, i) => {
    map[ch] = palette[i % palette.length]
  })
  return map
}

/**
 * Wordle-style evaluation: 'decoded' = right letter at right index,
 * 'found' = letter is somewhere else in target, 'absent' = not in target.
 * Handles repeated letters via consume-on-first-pass.
 */
export function evaluateGuess(guess: string, target: string): LetterState[] {
  const g = guess.toUpperCase()
  const t = target.toUpperCase().split('')
  const result: LetterState[] = Array(g.length).fill('absent')
  for (let i = 0; i < g.length; i++) {
    if (g[i] === t[i]) {
      result[i] = 'decoded'
      t[i] = '*'
    }
  }
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'decoded') continue
    const idx = t.indexOf(g[i])
    if (idx >= 0) {
      result[i] = 'found'
      t[idx] = '*'
    }
  }
  return result
}

export interface RevealState {
  /** Target indices that have been guessed at the correct position. */
  decodedPositions: Set<number>
  /** Letters known to be in the target somewhere (color hint for target glyph). */
  found: Set<string>
}

/**
 * Walks guess history and accumulates target positions decoded (per-position,
 * so duplicate letters in the target aren't all hidden when only one instance
 * has been pinned), plus the set of letters known to be in the target.
 */
export function computeRevealState(
  guesses: readonly string[],
  evaluations: readonly LetterState[][],
  target: string,
): RevealState {
  const t = target.toUpperCase()
  const decodedPositions = new Set<number>()
  const found = new Set<string>()
  for (let g = 0; g < guesses.length; g++) {
    const word = guesses[g].toUpperCase()
    const ev = evaluations[g]
    for (let i = 0; i < word.length; i++) {
      if (ev[i] === 'decoded' && word[i] === t[i]) decodedPositions.add(i)
      else if (ev[i] === 'found' || ev[i] === 'decoded') found.add(word[i])
    }
  }
  return { decodedPositions, found }
}
