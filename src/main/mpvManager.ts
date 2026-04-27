import { spawn, ChildProcess } from 'child_process'
import * as net from 'net'
import { BrowserWindow } from 'electron'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

interface MpvSession {
  process: ChildProcess
  socketPath: string
  socket: net.Socket | null
  pendingRequests: Map<number, PendingRequest>
  nextId: number
  lineBuffer: string
  category: string | undefined
  win: BrowserWindow
  mainHwnd: bigint
  cleanupListeners: (() => void) | null
}

let session: MpvSession | null = null
let launching = false
let lastTimePush = 0

const TITLEBAR_HEIGHT = 40

function makeSocketPath(): string {
  const id = Date.now()
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\vault-mpv-${id}`
    : `/tmp/vault-mpv-${id}.sock`
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type VaultHwnd = {
  setWindowBehind: (mpvHwnd: bigint, mainHwnd: bigint, x: number, y: number, w: number, h: number) => boolean
  getChildWindowInfo: (hwnd: bigint) => Array<{ className: string; hwnd: string }>
}

function loadAddon(): VaultHwnd | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('vault-hwnd') as VaultHwnd
  } catch (e) {
    console.error('[vault-hwnd] failed to load native addon:', e)
    return null
  }
}

function positionMpvBehind(mpvHwnd: bigint, win: BrowserWindow, mainHwnd: bigint): void {
  const addon = loadAddon()
  if (!addon) return
  const b = win.getBounds()
  const ok = addon.setWindowBehind(
    mpvHwnd, mainHwnd,
    b.x, b.y + TITLEBAR_HEIGHT,
    b.width, b.height - TITLEBAR_HEIGHT
  )
  console.log(`[vault-hwnd] setWindowBehind(${mpvHwnd}): ${ok}`)
}

export async function launchEmbedded(
  filePath: string,
  mpvPath: string,
  embeddedConfigFile: string,
  mainHwnd: bigint,
  category: string | undefined,
  win: BrowserWindow
): Promise<void> {
  if (launching) return
  launching = true

  try {
    if (session) await teardown()

    const socketPath = makeSocketPath()
    const langArgs = category === 'anime' ? ['--alang=ja,jpn,jp', '--slang=en,eng'] : []

    const args = [
      `--input-ipc-server=${socketPath}`,
      '--no-osc',
      '--no-input-default-bindings',
      '--no-input-vo-keyboard',
      '--no-input-cursor',
      '--no-border',
      '--pause=no',
      `--include=${embeddedConfigFile}`,
      ...langArgs,
      filePath
    ]

    const child = spawn(mpvPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: false
    })

    session = {
      process: child,
      socketPath,
      socket: null,
      pendingRequests: new Map(),
      nextId: 1,
      lineBuffer: '',
      category,
      win,
      mainHwnd,
      cleanupListeners: null
    }

    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (chunk: string) => {
      console.log('[mpv stderr]', chunk.trim())
    })

    child.on('exit', () => handleMpvExit(win))
    child.on('error', (err) => {
      console.error('[mpv] process error:', err)
      handleMpvExit(win)
    })

    await connectIpc()
  } finally {
    launching = false
  }
}

async function connectIpc(): Promise<void> {
  if (!session) return
  const { socketPath, win } = session
  const deadline = Date.now() + 6000

  while (Date.now() < deadline) {
    try {
      const socket = await new Promise<net.Socket>((resolve, reject) => {
        const s = net.createConnection(socketPath)
        s.once('connect', () => resolve(s))
        s.once('error', reject)
      })

      if (!session) { socket.destroy(); return }

      session.socket = socket
      socket.setEncoding('utf-8')
      socket.on('data', handleSocketData)
      socket.on('error', () => handleMpvExit(win))
      socket.on('close', () => handleMpvExit(win))

      startPropertyObservers()
      setupWindowTracking()
      return
    } catch {
      await sleep(250)
    }
  }

  console.error('[mpv] IPC connection timed out')
  handleMpvExit(win)
}

/** After IPC connects: read mpv's window-id and position it behind the Electron window. */
async function setupWindowTracking(): Promise<void> {
  if (!session) return
  const { win, mainHwnd } = session

  let mpvHwnd: bigint | null = null
  for (let i = 0; i < 20; i++) {
    try {
      const windowId = await sendCommand(['get_property', 'window-id'])
      if (typeof windowId === 'number' && windowId > 0) {
        mpvHwnd = BigInt(Math.round(windowId))
        break
      }
    } catch { /* not ready yet */ }
    await sleep(150)
  }

  if (!mpvHwnd) {
    console.error('[mpv] could not get window-id')
    return
  }

  console.log(`[mpv] window-id: ${mpvHwnd}`)

  positionMpvBehind(mpvHwnd, win, mainHwnd)

  const capturedHwnd = mpvHwnd
  const onMove   = (): void => positionMpvBehind(capturedHwnd, win, mainHwnd)
  const onResize = (): void => positionMpvBehind(capturedHwnd, win, mainHwnd)
  win.on('move',   onMove)
  win.on('resize', onResize)

  if (session) {
    session.cleanupListeners = () => {
      win.off('move',   onMove)
      win.off('resize', onResize)
    }
  }
}

function handleSocketData(chunk: string): void {
  if (!session) return
  session.lineBuffer += chunk
  const lines = session.lineBuffer.split('\n')
  session.lineBuffer = lines.pop() ?? ''

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line) as {
        request_id?: number
        error?: string
        data?: unknown
        event?: string
        id?: number
        name?: string
      }

      if (msg.request_id !== undefined) {
        const pending = session.pendingRequests.get(msg.request_id)
        if (pending) {
          session.pendingRequests.delete(msg.request_id)
          if (msg.error === 'success') {
            pending.resolve(msg.data)
          } else {
            pending.reject(new Error(msg.error ?? 'mpv error'))
          }
        }
      } else if (msg.event) {
        handleMpvEvent(msg as { event: string; id?: number; data?: unknown })
      }
    } catch { /* malformed JSON */ }
  }
}

function handleMpvEvent(msg: { event: string; id?: number; data?: unknown }): void {
  if (!session) return
  const { win } = session

  if (msg.event === 'property-change') {
    switch (msg.id) {
      case 1: { // time-pos
        const now = Date.now()
        if (now - lastTimePush > 250 && msg.data !== null) {
          lastTimePush = now
          if (!win.isDestroyed()) win.webContents.send('mpv:timePos', msg.data)
        }
        break
      }
      case 2: // pause
        if (!win.isDestroyed()) win.webContents.send('mpv:pause', msg.data)
        break
      case 3: // duration
        if (!win.isDestroyed()) win.webContents.send('mpv:duration', msg.data)
        break
      case 4: { // track-list
        if (!win.isDestroyed()) win.webContents.send('mpv:trackList', msg.data)
        if (session.category === 'anime' && Array.isArray(msg.data)) {
          const tracks = msg.data as Array<{ type: string; lang?: string; id: number }>
          const engSub = tracks.find(
            (t) => t.type === 'sub' && (t.lang === 'en' || t.lang === 'eng')
          )
          if (engSub) sendCommand(['set_property', 'sid', engSub.id]).catch(() => {})
        }
        break
      }
    }
    return
  }

  if (msg.event === 'end-file') {
    if (!win.isDestroyed()) win.webContents.send('mpv:ended')
  }
}

function startPropertyObservers(): void {
  sendCommand(['observe_property', 1, 'time-pos']).catch(() => {})
  sendCommand(['observe_property', 2, 'pause']).catch(() => {})
  sendCommand(['observe_property', 3, 'duration']).catch(() => {})
  sendCommand(['observe_property', 4, 'track-list']).catch(() => {})
}

export function sendCommand(cmd: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!session?.socket) {
      reject(new Error('mpv not connected'))
      return
    }
    const id = session.nextId++
    session.pendingRequests.set(id, { resolve, reject })
    try {
      session.socket.write(JSON.stringify({ command: cmd, request_id: id }) + '\n')
    } catch (e) {
      session.pendingRequests.delete(id)
      reject(e)
      return
    }
    setTimeout(() => {
      if (session?.pendingRequests.has(id)) {
        session.pendingRequests.delete(id)
        reject(new Error('mpv command timed out'))
      }
    }, 3000)
  })
}

export async function teardown(): Promise<void> {
  if (!session) return
  const s = session
  session = null
  lastTimePush = 0

  s.cleanupListeners?.()

  try {
    if (s.socket && !s.socket.destroyed) {
      s.socket.write(JSON.stringify({ command: ['quit'], request_id: s.nextId++ }) + '\n')
    }
  } catch { /* ignore */ }

  s.socket?.destroy()

  for (const [, pending] of s.pendingRequests) {
    pending.reject(new Error('mpv session closed'))
  }
  s.pendingRequests.clear()

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try { s.process.kill() } catch { /* already dead */ }
      resolve()
    }, 1500)
    s.process.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

function handleMpvExit(win: BrowserWindow): void {
  if (!session) return
  session.cleanupListeners?.()
  session = null
  lastTimePush = 0
  if (!win.isDestroyed()) win.webContents.send('mpv:ended')
}

export function getMpvSession(): MpvSession | null {
  return session
}

export function reapplyZOrder(mainHwnd: bigint): void {
  if (!session) return
  positionMpvBehind(BigInt(0), session.win, mainHwnd)
}
