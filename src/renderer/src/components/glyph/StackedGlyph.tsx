import { GLYPH_VIEWBOX, LETTER_SHAPES } from './letterShapes'

export interface StackedLetter {
  letter: string
  color: string
  visible?: boolean
}

interface Props {
  letters: readonly StackedLetter[]
  size?: number
  strokeWidth?: number
  className?: string
}

/**
 * Stacked-glyph renderer.
 *
 * Z-order: `letters[0]` is the TOP of the stack — drawn last so it visually
 * obscures lower indices where strokes overlap. This matches the game's rule
 * ("letters higher in the stack obscure letters lower").
 *
 * Letters with `visible: false` are skipped entirely (used to remove decoded
 * letters from the daily glyph).
 */
export default function StackedGlyph({
  letters,
  size = 200,
  strokeWidth = 8,
  className,
}: Props): JSX.Element {
  const drawOrder = [...letters].reverse()
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GLYPH_VIEWBOX} ${GLYPH_VIEWBOX}`}
      className={className}
      style={{ display: 'block' }}
    >
      {drawOrder.map((l, i) => {
        if (l.visible === false) return null
        const shape = LETTER_SHAPES[l.letter.toUpperCase()]
        if (!shape) return null
        return (
          <g key={i}>
            {shape.map((stroke, j) => (
              <polyline
                key={j}
                points={stroke.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="none"
                stroke={l.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
