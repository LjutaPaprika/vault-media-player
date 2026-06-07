// Per-letter color palette. Each A-Z letter gets a distinct, saturated hue so
// stacked glyphs remain distinguishable even when they overlap heavily.
// Hues are evenly spaced around the wheel, with a small offset to avoid the
// muddy yellow-greens landing on the most common letters.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const LETTER_COLORS: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {}
  for (let i = 0; i < ALPHABET.length; i++) {
    const hue = ((i * 360) / ALPHABET.length + 200) % 360
    out[ALPHABET[i]] = `hsl(${hue}, 78%, 65%)`
  }
  return out
})()

export function colorFor(letter: string): string {
  return LETTER_COLORS[letter.toUpperCase()] ?? '#ffffff'
}
