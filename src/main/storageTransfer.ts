import { BrowserWindow } from 'electron'
import { existsSync, promises as fsp, readdirSync, statSync, rmSync } from 'fs'
import { join } from 'path'

export type TransferAction = 'copy' | 'move' | 'delete'
export type ConflictPolicy = 'skip' | 'replace'
export type Side = 'vault' | 'cold'

export interface TransferItem {
  side: Side
  relPath: string  // forward-slash path under media/
}

export interface TransferRequest {
  action: TransferAction
  items: TransferItem[]
  /** Required for copy/move; ignored for delete. */
  destSide?: Side
  conflictPolicy: ConflictPolicy
}

export type TransferPhase = 'starting' | 'copying' | 'verifying' | 'deleting' | 'done' | 'error' | 'skipped'

export interface TransferProgress {
  phase: TransferPhase
  itemIndex: number   // 1-based index of current item
  itemTotal: number   // total items in batch
  itemName?: string   // current folder display name (NOT shown in pill — for detail panel only)
  bytesDone?: number
  bytesTotal?: number
  message?: string
}

/** Recursively sum file sizes under absPath. */
export function dirSizeSync(absPath: string): number {
  let total = 0
  try {
    for (const entry of readdirSync(absPath, { withFileTypes: true })) {
      const child = join(absPath, entry.name)
      try {
        if (entry.isDirectory()) total += dirSizeSync(child)
        else if (entry.isFile()) total += statSync(child).size
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return total
}

/** Resolve `<root>/media/<relPath>` (forward-slash → platform path). */
export function mediaPath(root: string, relPath: string): string {
  return relPath
    ? join(root, 'media', ...relPath.split('/').filter(Boolean))
    : join(root, 'media')
}

interface RunCtx {
  win: BrowserWindow
  vaultRoot: string
  coldRoot: string | null
  send: (p: TransferProgress) => void
}

async function copyOne(ctx: RunCtx, item: TransferItem, destSide: Side, policy: ConflictPolicy, index: number, total: number): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const srcRoot = item.side === 'vault' ? ctx.vaultRoot : ctx.coldRoot
  const dstRoot = destSide   === 'vault' ? ctx.vaultRoot : ctx.coldRoot
  if (!srcRoot || !dstRoot) return { ok: false, error: 'Drive unavailable' }

  const src = mediaPath(srcRoot, item.relPath)
  const dst = mediaPath(dstRoot, item.relPath)
  const name = item.relPath.split('/').pop() ?? item.relPath

  if (!existsSync(src)) return { ok: false, error: `Source missing: ${item.relPath}` }

  if (existsSync(dst)) {
    if (policy === 'skip') {
      ctx.send({ phase: 'skipped', itemIndex: index, itemTotal: total, itemName: name, message: 'destination exists' })
      return { ok: true, skipped: true }
    }
    // policy === 'replace' — delete the destination first, then fresh copy
    ctx.send({ phase: 'copying', itemIndex: index, itemTotal: total, itemName: name, message: 'replacing destination' })
    try { await fsp.rm(dst, { recursive: true, force: true }) }
    catch (err) { return { ok: false, error: `Failed to clear destination: ${String(err)}` } }
  } else {
    ctx.send({ phase: 'copying', itemIndex: index, itemTotal: total, itemName: name })
  }

  try {
    // fs.promises.cp handles cross-platform recursive copy with native acceleration.
    // recursive: true required for directories; force: true ensures overwrites within a directory.
    await fsp.cp(src, dst, { recursive: true, force: true, errorOnExist: false })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Copy failed: ${String(err)}` }
  }
}

async function moveOne(ctx: RunCtx, item: TransferItem, destSide: Side, policy: ConflictPolicy, index: number, total: number): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const copyRes = await copyOne(ctx, item, destSide, policy, index, total)
  if (!copyRes.ok || copyRes.skipped) return copyRes

  // Verify by recursive byte sum before deleting the source.
  const srcRoot = item.side === 'vault' ? ctx.vaultRoot : ctx.coldRoot
  const dstRoot = destSide   === 'vault' ? ctx.vaultRoot : ctx.coldRoot
  if (!srcRoot || !dstRoot) return { ok: false, error: 'Drive unavailable during verify' }

  const src = mediaPath(srcRoot, item.relPath)
  const dst = mediaPath(dstRoot, item.relPath)
  const name = item.relPath.split('/').pop() ?? item.relPath

  ctx.send({ phase: 'verifying', itemIndex: index, itemTotal: total, itemName: name })
  const srcBytes = dirSizeSync(src)
  const dstBytes = dirSizeSync(dst)
  if (srcBytes !== dstBytes) {
    return { ok: false, error: `Size mismatch after copy (${srcBytes} vs ${dstBytes}). Source not deleted.` }
  }

  ctx.send({ phase: 'deleting', itemIndex: index, itemTotal: total, itemName: name })
  try {
    await fsp.rm(src, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Source delete failed (copy succeeded): ${String(err)}` }
  }
}

async function deleteOne(ctx: RunCtx, item: TransferItem, index: number, total: number): Promise<{ ok: boolean; error?: string }> {
  const root = item.side === 'vault' ? ctx.vaultRoot : ctx.coldRoot
  if (!root) return { ok: false, error: 'Drive unavailable' }
  const target = mediaPath(root, item.relPath)
  const name = item.relPath.split('/').pop() ?? item.relPath

  ctx.send({ phase: 'deleting', itemIndex: index, itemTotal: total, itemName: name })
  if (!existsSync(target)) return { ok: true }
  try {
    await fsp.rm(target, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Delete failed: ${String(err)}` }
  }
}

export async function runTransfer(
  req: TransferRequest,
  vaultRoot: string,
  coldRoot: string | null,
  win: BrowserWindow
): Promise<{ success: boolean; errors: { relPath: string; error: string }[]; skipped: number }> {
  const send = (p: TransferProgress): void => {
    if (!win.isDestroyed()) win.webContents.send('storage:progress', p)
  }
  const ctx: RunCtx = { win, vaultRoot, coldRoot, send }
  const errors: { relPath: string; error: string }[] = []
  let skipped = 0

  send({ phase: 'starting', itemIndex: 0, itemTotal: req.items.length })

  for (let i = 0; i < req.items.length; i++) {
    const item = req.items[i]
    const index = i + 1
    let res: { ok: boolean; skipped?: boolean; error?: string }

    if (req.action === 'delete') {
      res = await deleteOne(ctx, item, index, req.items.length)
    } else if (req.action === 'copy') {
      if (!req.destSide) { errors.push({ relPath: item.relPath, error: 'destSide missing' }); continue }
      res = await copyOne(ctx, item, req.destSide, req.conflictPolicy, index, req.items.length)
    } else {
      if (!req.destSide) { errors.push({ relPath: item.relPath, error: 'destSide missing' }); continue }
      res = await moveOne(ctx, item, req.destSide, req.conflictPolicy, index, req.items.length)
    }

    if (!res.ok) errors.push({ relPath: item.relPath, error: res.error ?? 'unknown' })
    if (res.skipped) skipped++
  }

  if (errors.length > 0) {
    send({ phase: 'error', itemIndex: req.items.length, itemTotal: req.items.length, message: `${errors.length} item(s) failed` })
  } else {
    send({ phase: 'done', itemIndex: req.items.length, itemTotal: req.items.length })
  }

  return { success: errors.length === 0, errors, skipped }
}

/** Used by the renderer to pre-check destination conflicts before showing the confirm modal. */
export function checkConflicts(
  items: TransferItem[],
  destSide: Side,
  vaultRoot: string,
  coldRoot: string | null
): { relPath: string; exists: boolean }[] {
  const dstRoot = destSide === 'vault' ? vaultRoot : coldRoot
  if (!dstRoot) return items.map((it) => ({ relPath: it.relPath, exists: false }))
  return items.map((it) => ({
    relPath: it.relPath,
    exists: existsSync(mediaPath(dstRoot, it.relPath))
  }))
}

/** Synchronously delete a path tree. Used by tests or fallback paths. */
export function rmTreeSync(absPath: string): void {
  rmSync(absPath, { recursive: true, force: true })
}
