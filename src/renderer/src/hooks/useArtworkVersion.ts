import { useSyncExternalStore } from 'react'
import { artworkVersion, subscribeArtworkVersion } from '../utils/artworkVersion'

/** The current artwork version (see utils/artworkVersion); re-renders when a scan changes it. */
export function useArtworkVersion(): number {
  return useSyncExternalStore(subscribeArtworkVersion, artworkVersion)
}
