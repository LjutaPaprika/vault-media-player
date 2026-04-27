import { useEffect } from 'react'
import { useVideoPlayerStore } from '../store/videoPlayerStore'
import { useController } from '../hooks/useController'
import PlayerOverlay from './PlayerOverlay'
import styles from './VideoPlayer.module.css'

interface Props {
  filePath: string
  category?: string
}

function titleFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  return base.replace(/\.[^.]+$/, '')
}

export default function VideoPlayer({ filePath, category }: Props): React.JSX.Element {
  const close = useVideoPlayerStore((s) => s.close)
  const title = titleFromPath(filePath)

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          window.api.mpv.command(['cycle', 'pause']).catch(console.error)
          break
        case 'ArrowLeft':
          e.preventDefault()
          window.api.mpv.command(['seek', '-10', 'relative']).catch(console.error)
          break
        case 'ArrowRight':
          e.preventDefault()
          window.api.mpv.command(['seek', '10', 'relative']).catch(console.error)
          break
        case 'Escape':
          e.preventDefault()
          close()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  // Gamepad controls
  useController({
    onButton(btn) {
      switch (btn) {
        case 'confirm':
          window.api.mpv.command(['cycle', 'pause']).catch(console.error)
          break
        case 'back':
          close()
          break
        case 'left':
          window.api.mpv.command(['seek', '-10', 'relative']).catch(console.error)
          break
        case 'right':
          window.api.mpv.command(['seek', '10', 'relative']).catch(console.error)
          break
      }
    },
    enabled: true
  })

  // Suppress unused prop warning (category is used by the store's open() call upstream)
  void category

  return (
    <div className={styles.container}>
      <PlayerOverlay title={title} />
    </div>
  )
}
