import { GLYPH_VIEWBOX, LETTER_SHAPES } from './letterShapes'

interface Props {
  letter: string
  color?: string
  strokeWidth?: number
  size?: number
}

export default function LetterGlyph({
  letter,
  color = '#ffffff',
  strokeWidth = 8,
  size = 100,
}: Props): JSX.Element | null {
  const shape = LETTER_SHAPES[letter.toUpperCase()]
  if (!shape) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GLYPH_VIEWBOX} ${GLYPH_VIEWBOX}`}
      style={{ display: 'block' }}
    >
      {shape.map((stroke, i) => (
        <polyline
          key={i}
          points={stroke.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
