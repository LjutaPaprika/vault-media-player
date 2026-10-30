import { join, basename } from 'path'
import { playtimeEvents } from './playtime'
import { SessionParking, type Parkable } from './sessionParking'
import { isRunning, isRunningSync } from './processCheck'
import { parkablesForLaunch, parkedLeftovers } from './saveLinks'
import { registryParkablesForLaunch, registryParkedLeftovers, saveRegistrySettings } from './registrySettings'

/**
 * What happens around a PC game session started from the drive, beyond the
 * lasting save links:
 *
 * - before it starts, anything of the PC's own that the game would use (a save
 *   folder or a registry key from the PC's own copy of the game) is set aside
 *   and the drive's put in its place (sessionParking.ts);
 * - when the session ends, registry settings are saved to the drive, and the
 *   PC's own things are put back once nothing from the game is running.
 */

let driveRootNow = ''

const parking = new SessionParking({
  stillRunning: (w) => isRunning({ ...w, exclude: driveRootNow ? [join(driveRootNow, 'app')] : [] }),
  stillRunningSync: (w) => isRunningSync({ ...w, exclude: driveRootNow ? [join(driveRootNow, 'app')] : [] }),
  // A resource every game shares waits on anything started from the drive (not Vault itself).
  driveFolders: () => (driveRootNow ? [join(driveRootNow, 'games'), join(driveRootNow, 'emulators')] : []),
  retryMs: 30_000,
  setTimer: (fn, ms) => { setTimeout(fn, ms).unref?.() },
  log: (msg) => console.log(msg)
})

/**
 * Called just before a PC game is spawned. Throws a message written for the
 * user if the PC's own saves cannot be set aside (typically: its own copy of
 * the game is running), in which case the game must not be started.
 */
export function prepareGameSession(driveRoot: string, filePath: string): void {
  driveRootNow = driveRoot
  const resources: Parkable[] = [
    ...parkablesForLaunch(driveRoot, filePath),
    ...registryParkablesForLaunch(driveRoot, filePath)
  ]
  parking.begin(filePath, basename(filePath), resources)
}

const watching = new Set<string>()

/** Called once the game is spawned and its playtime session has started. */
export function watchGameSession(driveRoot: string, filePath: string): void {
  if (watching.has(filePath)) return
  watching.add(filePath)
  const onEnd = (payload: { filePath: string }): void => {
    if (payload.filePath !== filePath) return
    playtimeEvents.off('session-ended', onEnd)
    watching.delete(filePath)
    try { saveRegistrySettings(driveRoot, filePath) } catch (err) {
      console.warn('[registry] could not save settings —', err)
    }
    parking.end(filePath)
  }
  playtimeEvents.on('session-ended', onEnd)
}

/** The launch failed after prepareGameSession: give back what was set aside. */
export function abandonGameSession(filePath: string): void {
  parking.end(filePath)
}

/** At startup: put back anything still set aside from a session Vault never saw end. */
export function recoverParked(driveRoot: string): void {
  driveRootNow = driveRoot
  for (const res of [...parkedLeftovers(driveRoot), ...registryParkedLeftovers(driveRoot)]) parking.adopt(res)
}

/** As Vault quits: put back whatever is no longer in use. */
export function releaseParkedOnQuit(): void {
  parking.releaseAllOnQuit()
}
