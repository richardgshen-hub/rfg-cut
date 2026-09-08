import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { EditSegment, MediaSource } from './project'
import { formatTime } from './transcription'

export type PlayerControl = { seek: (start: number, end?: number) => void; playSequence: () => void }
type Props = { source: MediaSource | null; segments: EditSegment[]; onError: (message: string) => void }
export const MediaPlayer = forwardRef<PlayerControl, Props>(function MediaPlayer({ source, segments, onError }, ref) {
  const media = useRef<HTMLVideoElement | null>(null)
  const sequence = useRef<{ ranges: { start: number; end: number }[]; index: number } | null>(null)
  const stopAt = useRef<number | null>(null)
  const [time, setTime] = useState(0)
  const [sequenceLabel, setSequenceLabel] = useState('原片预览')
  const rangeKey = segments.filter(s => s.enabled).map(s => `${s.start}:${s.end}`).join('|')
  useEffect(() => {
    sequence.current = null
    stopAt.current = null
    media.current?.pause()
  }, [rangeKey, source?.id])

  const startAt = (start: number) => {
    const player = media.current
    if (!player) return
    player.currentTime = start
    void player.play().catch(() => onError('无法播放这段媒体；可先尝试浏览器支持的 MP4/H.264，或下载后在本机播放器试听。'))
  }
  useImperativeHandle(ref, () => ({
    seek(start, end) {
      sequence.current = null
      stopAt.current = end ?? null
      setSequenceLabel(end === undefined ? '原片预览' : '单段试听')
      startAt(start)
    },
    playSequence() {
      const ranges = segments.filter(s => s.enabled).map(({ start, end }) => ({ start, end }))
      if (!ranges.length) return
      sequence.current = { ranges, index: 0 }
      stopAt.current = null
      setSequenceLabel(`成片顺序 · 1 / ${ranges.length}`)
      startAt(ranges[0].start)
    },
  }))

  const progress = () => {
    const player = media.current
    if (!player) return
    setTime(player.currentTime)
    if (stopAt.current !== null && player.currentTime >= stopAt.current) { player.pause(); stopAt.current = null }
    const queue = sequence.current
    if (!queue || player.currentTime < queue.ranges[queue.index].end - 0.03) return
    if (queue.index + 1 < queue.ranges.length) {
      queue.index += 1
      setSequenceLabel(`成片顺序 · ${queue.index + 1} / ${queue.ranges.length}`)
      startAt(queue.ranges[queue.index].start)
    } else {
      player.pause()
      sequence.current = null
      setSequenceLabel('顺序试听完成')
    }
  }

  if (!source) return <div className="player-empty"><img src="/brand/rfg-cut-mark.svg" alt="" /><h2>从真实素材开始</h2><p>导入一段采访、口播或录音。<br />已有逐字稿可以直接导入，跳过转写。</p></div>
  return <section className="player-area" aria-label="媒体预览">
    <div className="player-meta"><span>{sequenceLabel}</span><time>{formatTime(time)} / {formatTime(source.duration)}</time></div>
    <video ref={media} key={source.id} src={source.url} controls preload="metadata" playsInline onTimeUpdate={progress} onEnded={progress} onError={() => onError('媒体无法播放：文件可能已移动或编码不受浏览器支持。请重新导入可播放的素材。')} />
    {!source.hasVideo && <p className="muted">已导入音频，可试听并导出包含音频轨的 MP4。</p>}
    <p className="player-note">顺序试听会跳过未选内容；精确切点以导出的成片为准。</p>
  </section>
})
