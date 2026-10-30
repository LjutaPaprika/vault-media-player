/**
 * Holds a PC's own game data aside while a game started from the drive runs,
 * and puts it back afterwards.
 *
 * A "resource" is one thing the PC already had: a save folder (saveLinks.ts)
 * or a registry key (registrySettings.ts). Parking swaps it for the drive's
 * copy; unparking swaps it back. This module only decides *when*:
 *
 * - Several sessions can need the same resource (the crack's player-id folder
 *   serves many games), so each is held until the last of its sessions ends.
 * - A session ending is not proof the game is gone: launchers hand over to the
 *   real exe, games restart themselves, and the PC's own copy (Steam) may have
 *   been started meanwhile. Before unparking, `stillRunning` is asked about the
 *   resource's game folder and exe names; while anything matches, it waits and
 *   asks again. Unparking under a running game would send its writes into the
 *   PC's own folder.
 * - Parked resources found at startup (Vault crashed or the PC lost power
 *   mid-session) are adopted with no sessions and put back the same way.
 *
 * Nothing here touches files or the registry directly; the resources do. That
 * keeps the timing rules testable with fakes.
 */

export type Unparked = 'restored' | 'nothing-parked' | 'conflict'

export interface Parkable {
  /** Unique per resource, e.g. "folder:C:\...\BPM" or "reg:Software\X\Y". */
  id: string
  /** For messages: the save-links entry name. */
  name: string
  /** The game's folder on the drive, or null for a resource every game shares. */
  scope: string | null
  park(): void
  unpark(): Unparked
}

export interface Waiting {
  /** Folders whose processes must be gone, and exe names that must not run anywhere. */
  folders: string[]
  names: string[]
}

export interface ParkingDeps {
  stillRunning(w: Waiting): Promise<boolean>
  stillRunningSync(w: Waiting): boolean
  /** Shared resources wait on everything started from the drive. */
  driveFolders: () => string[]
  retryMs: number
  setTimer(fn: () => void, ms: number): void
  log(msg: string): void
}

interface Held {
  res: Parkable
  sessions: Set<string>
  names: Set<string>
  checking: boolean
}

export class SessionParking {
  private held = new Map<string, Held>()

  constructor(private deps: ParkingDeps) {}

  /**
   * Park everything a launch needs. All or nothing: if one resource cannot be
   * parked, the ones parked by this call are put back and the error (written
   * for the user) is thrown, so the game is not started half-linked.
   */
  begin(session: string, exeName: string, resources: Parkable[]): void {
    const parkedNow: Parkable[] = []
    try {
      for (const res of resources) {
        const h = this.held.get(res.id)
        if (h) {
          h.sessions.add(session)
          h.names.add(exeName)
          continue
        }
        res.park()
        parkedNow.push(res)
        this.held.set(res.id, { res, sessions: new Set([session]), names: new Set([exeName]), checking: false })
        this.deps.log(`[parking] ${res.name}: this PC's own copy set aside for the session`)
      }
    } catch (err) {
      for (const res of parkedNow.reverse()) {
        this.held.delete(res.id)
        try { res.unpark() } catch (e) { this.deps.log(`[parking] ${res.name}: could not undo — ${e}`) }
      }
      throw err
    }
  }

  /** A resource already parked when Vault started: hold it, then put it back once safe. */
  adopt(res: Parkable, exeNames: string[] = []): void {
    if (this.held.has(res.id)) return
    this.held.set(res.id, { res, sessions: new Set(), names: new Set(exeNames), checking: false })
    this.deps.log(`[parking] ${res.name}: found set aside from an earlier session`)
    void this.tryRelease(res.id)
  }

  end(session: string): void {
    for (const [id, h] of this.held) {
      if (h.sessions.delete(session) && h.sessions.size === 0) void this.tryRelease(id)
    }
  }

  isHeld(id: string): boolean {
    return this.held.has(id)
  }

  private waitingFor(h: Held): Waiting {
    return {
      folders: h.res.scope ? [h.res.scope] : this.deps.driveFolders(),
      names: [...h.names]
    }
  }

  private async tryRelease(id: string): Promise<void> {
    const h = this.held.get(id)
    if (!h || h.sessions.size > 0 || h.checking) return
    h.checking = true
    let running: boolean
    try { running = await this.deps.stillRunning(this.waitingFor(h)) } catch { running = true }
    h.checking = false
    // A new session may have taken it while we were checking.
    if (this.held.get(id) !== h || h.sessions.size > 0) return
    if (running) {
      this.deps.setTimer(() => void this.tryRelease(id), this.deps.retryMs)
      return
    }
    this.release(h)
  }

  private release(h: Held): void {
    this.held.delete(h.res.id)
    try {
      const r = h.res.unpark()
      this.deps.log(r === 'conflict'
        ? `[parking] ${h.res.name}: this PC made a new copy meanwhile; both kept (the set-aside one ends in .vault-host)`
        : `[parking] ${h.res.name}: this PC's own copy put back (${r})`)
    } catch (err) {
      this.deps.log(`[parking] ${h.res.name}: could not put back — ${err}`)
    }
  }

  /**
   * Vault is quitting: put back everything whose game is no longer running,
   * checked synchronously because nothing scheduled will run after this.
   * Anything still in use stays parked and is recovered at the next start.
   */
  releaseAllOnQuit(): void {
    for (const h of [...this.held.values()]) {
      let running: boolean
      try { running = this.deps.stillRunningSync(this.waitingFor(h)) } catch { running = true }
      if (running) {
        this.deps.log(`[parking] ${h.res.name}: still in use as Vault quits; it will be put back at the next start`)
        continue
      }
      this.release(h)
    }
  }
}
