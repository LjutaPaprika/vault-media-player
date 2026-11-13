import { useId } from 'react'

interface Props {
  /** Rendered width and height in CSS px. */
  size: number
  /** Draw the dark rounded tile behind the door, as the app icon has. */
  tile?: boolean
  className?: string
}

/**
 * Vault's mark: a gold vault door with a play button for a hub. The same
 * drawing as build/icon.svg (the app and taskbar icon); keep the two in step.
 *
 * Fixed gold rather than the accent colour, so the mark inside the app matches
 * the icon Windows and macOS show for it.
 */
export default function VaultMark({ size, tile = true, className }: Props): JSX.Element {
  // Several marks can be on screen at once; gradient ids must not collide.
  const id = useId().replace(/:/g, '')
  const gold = `vm-gold-${id}`
  const bg = `vm-bg-${id}`
  const bolts = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role="img"
      aria-label="Vault"
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#26262c" />
          <stop offset="1" stopColor="#121215" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6d27a" />
          <stop offset="0.55" stopColor="#e8b44b" />
          <stop offset="1" stopColor="#b9842a" />
        </linearGradient>
      </defs>
      {tile && <rect width="256" height="256" rx="56" fill={`url(#${bg})`} />}
      <circle cx="128" cy="128" r="92" fill="none" stroke={`url(#${gold})`} strokeWidth="20" />
      <g fill={`url(#${gold})`}>
        {bolts.map((deg) => (
          <circle key={deg} cx="128" cy="58" r="7" transform={`rotate(${deg} 128 128)`} />
        ))}
      </g>
      <circle cx="128" cy="128" r="46" fill={`url(#${gold})`} />
      <path d="M114 104 L152 128 L114 152 Z" fill="#141417" stroke="#141417" strokeWidth="6" strokeLinejoin="round" />
    </svg>
  )
}
