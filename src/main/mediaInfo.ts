import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

export interface AudioTrack {
  lang: string
  codec: string
  channels: number
}

export interface SubtitleTrack {
  lang: string
}

export interface MediaTechInfo {
  duration: number        // seconds
  fileSize: number        // bytes
  videoCodec: string
  width: number
  height: number
  audioTracks: AudioTrack[]
  subtitleTracks: SubtitleTrack[]
}

export function probeFile(filePath: string, ffprobePath: string): MediaTechInfo | null {
  if (!existsSync(filePath)) return null
  try {
    const result = spawnSync(
      ffprobePath,
      ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      { timeout: 15000, encoding: 'utf-8', windowsHide: true }
    )
    if (result.status !== 0 || !result.stdout) return null

    const data = JSON.parse(result.stdout) as {
      format?: { duration?: string; size?: string }
      streams?: {
        codec_type?: string
        codec_name?: string
        width?: number
        height?: number
        channels?: number
        tags?: { language?: string }
      }[]
    }

    const format = data.format ?? {}
    const streams = data.streams ?? []
    const video = streams.find((s) => s.codec_type === 'video')
    const audios = streams.filter((s) => s.codec_type === 'audio')
    const subs = streams.filter((s) => s.codec_type === 'subtitle')

    return {
      duration: parseFloat(format.duration ?? '0'),
      fileSize: parseInt(format.size ?? '0', 10),
      videoCodec: video?.codec_name ?? '',
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      audioTracks: audios.map((s) => ({
        lang: s.tags?.language ?? 'und',
        codec: s.codec_name ?? '',
        channels: s.channels ?? 0
      })),
      subtitleTracks: subs.map((s) => ({ lang: s.tags?.language ?? 'und' }))
    }
  } catch {
    return null
  }
}

export interface AudioFileMeta {
  duration: number
  title?: string
  artist?: string
}

export function probeAudioFileSync(filePath: string, ffprobePath: string): AudioFileMeta {
  try {
    const result = spawnSync(
      ffprobePath,
      ['-v', 'quiet', '-print_format', 'json', '-show_entries', 'format_tags=title,artist:format=duration', filePath],
      { timeout: 8000, encoding: 'utf-8', windowsHide: true }
    )
    if (result.status !== 0 || !result.stdout) return { duration: 0 }
    const data = JSON.parse(result.stdout) as { format?: { duration?: string; tags?: { title?: string; artist?: string } } }
    return {
      duration: parseFloat(data.format?.duration ?? '0') || 0,
      title:    data.format?.tags?.title  || undefined,
      artist:   data.format?.tags?.artist || undefined,
    }
  } catch {
    return { duration: 0 }
  }
}
