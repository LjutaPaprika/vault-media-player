import LetterGlyph from './glyph/LetterGlyph'
import StackedGlyph, { StackedLetter } from './glyph/StackedGlyph'
import { LETTER_SHAPES } from './glyph/letterShapes'

const LETTERS = Object.keys(LETTER_SHAPES)

const WHITE = '#ffffff'

// Demo: tint colors for "revealed" letters in a sample puzzle.
const DEMO_TINTS: Record<string, string> = {
  T: 'hsl(330, 80%, 65%)', // pink
  R: 'hsl(195, 85%, 60%)', // blue
  D: 'hsl(45, 90%, 60%)',  // yellow
}

function stackWord(
  word: string,
  opts: { reveal?: string[]; decoded?: string[] } = {},
): StackedLetter[] {
  const decoded = new Set((opts.decoded ?? []).map((c) => c.toUpperCase()))
  const revealed = new Set((opts.reveal ?? []).map((c) => c.toUpperCase()))
  return word.split('').map((ch) => {
    const C = ch.toUpperCase()
    return {
      letter: ch,
      color: revealed.has(C) ? DEMO_TINTS[C] ?? WHITE : WHITE,
      visible: !decoded.has(C),
    }
  })
}

function yourStack(word: string, decoded: string[]): StackedLetter[] {
  const set = new Set(decoded.map((c) => c.toUpperCase()))
  return word.split('').map((ch) => ({
    letter: ch,
    color: DEMO_TINTS[ch.toUpperCase()] ?? WHITE,
    visible: set.has(ch.toUpperCase()),
  }))
}

export default function Glyph(): JSX.Element {
  return (
    <div style={{ padding: 20, color: '#cbd0ff' }}>
      <div style={{ color: '#8aa', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
        Target / Your glyph — phase 2 preview
      </div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: 'Target — fresh (all white)',          word: 'THREAD', opts: {} },
          { label: 'Target — R found, T found',            word: 'THREAD', opts: { reveal: ['T', 'R'] } },
          { label: 'Target — R decoded (removed)',         word: 'THREAD', opts: { decoded: ['R'] } },
          { label: 'Your glyph — only R decoded',          word: 'THREAD', opts: {}, yours: ['R'] as string[] },
          { label: 'PUSHED — fresh',                        word: 'PUSHED', opts: {} },
        ].map(({ label, word, opts, yours }) => (
          <div key={label} style={{
            background: '#11131a',
            border: '1px solid #2a3146',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            width: 200,
          }}>
            <StackedGlyph
              letters={yours ? yourStack(word, yours) : stackWord(word, opts)}
              size={170}
              strokeWidth={5}
            />
            <div style={{ fontSize: 11, color: '#5b6480', letterSpacing: '0.05em', textAlign: 'center' }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ color: '#8aa', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
        Alphabet reference
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
        gap: 8,
      }}>
        {LETTERS.map((l) => (
          <div key={l} style={{
            background: '#11131a',
            border: '1px solid #2a3146',
            borderRadius: 10,
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}>
            <LetterGlyph letter={l} color="#cbd0ff" strokeWidth={6} size={60} />
            <div style={{ fontSize: 10, color: '#5b6480', letterSpacing: '0.1em' }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
