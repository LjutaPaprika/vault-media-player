import { useEffect } from 'react'
import { useVideoPlayerStore, initVideoPlayerListeners } from './store/videoPlayerStore'
import { useController } from './hooks/useController'
import PlayerOverlay from './components/PlayerOverlay'

function titleFromUrlParam(): string {
  const fp = new URLSearchParams(window.location.search).get('file') ?? ''
  const base = fp.replace(/\\/g, '/').split('/').pop() ?? fp
  return base.replace(/\.[^.]+$/, '')
}

export default function OverlayApp(): React.JSX.Element {
  const close = useVideoPlayerStore((s) => s.close)

  useEffect(() => {
    initVideoPlayerListeners()
  }, [])

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

  const title = titleFromUrlParam()

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent' }}>
      <PlayerOverlay title={title} />
    </div>
  )
}
