// album.json: the small sidecar in each music playlist folder. It holds the
// cached track metadata ("durations"), the playlist's artist and its custom
// track order ("order").
//
// Three things write it: the scan and the playlist page (metadata cache), the
// YouTube import (artist) and a drag on the playlist page (order). Each used to
// read the file, work, then write back the whole of what it had read, so a
// write landing in between was silently undone. In particular the playlist
// page reads, then awaits ffprobe for every unprobed track, then writes: a
// drag saved during that wait would be lost. Every writer now goes through
// updateAlbumJson, which reads the file afresh, changes only its own keys and
// writes synchronously, so nothing else can run in between.

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

export type AlbumJson = Record<string, unknown>

function albumJsonPath(dir: string): string {
  return join(dir, 'album.json')
}

/** The folder's album.json, or {} when there is none or it can't be read. */
export function readAlbumJson(dir: string): AlbumJson {
  try {
    const value = JSON.parse(readFileSync(albumJsonPath(dir), 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

/**
 * Reads album.json afresh, applies `change` to it and writes the result.
 *
 * Throws, writing nothing, when an existing file isn't a JSON object: it may
 * hold an artist or a saved order, and overwriting it would lose them.
 * The write goes to a temporary file that then replaces album.json, so a
 * crash or a pulled drive mid-write can't leave it half-written.
 */
export function updateAlbumJson(dir: string, change: (data: AlbumJson) => AlbumJson): AlbumJson {
  const path = albumJsonPath(dir)
  let data: AlbumJson = {}
  if (existsSync(path)) {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${path} is not a JSON object; leaving it alone`)
    }
    data = parsed as AlbumJson
  }
  const next = change({ ...data })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(next))
  try {
    renameSync(tmp, path)
  } catch (err) {
    // A brief lock (an antivirus scan, Explorer's preview) can refuse the
    // replace. Write in place instead rather than lose the change.
    try { unlinkSync(tmp) } catch { /* already gone */ }
    writeFileSync(path, JSON.stringify(next))
    console.warn('[album.json] replace failed, wrote in place:', path, err)
  }
  return next
}
