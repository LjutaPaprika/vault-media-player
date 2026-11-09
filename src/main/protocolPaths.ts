// Reading the file path back out of a thumb:// or media:// URL (built by the
// renderer's protocolUrl). Kept apart from index.ts so it can be tested
// without Electron.

/**
 * The file a protocol URL names. Only the path counts: a query such as the
 * renderer's ?v= cache-buster is ignored, and each path segment arrives
 * percent-encoded (so a "#" or "?" in a file name is part of the path).
 */
export function filePathFromProtocolUrl(url: string, platform: NodeJS.Platform = process.platform): string {
  const pathname = decodeURIComponent(new URL(url).pathname)
  // On Windows the path arrives as /E:/... — drop the leading slash.
  return platform === 'win32' ? pathname.slice(1) : pathname
}

/** thumb://<width>/<path>: the width the surface asked for, and the file. */
export function parseThumbUrl(url: string, platform: NodeJS.Platform = process.platform): { width: number; filePath: string } {
  return { width: parseInt(new URL(url).hostname, 10), filePath: filePathFromProtocolUrl(url, platform) }
}
