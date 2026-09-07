import type { TranscriptLine } from './transcription'

function parseTimecode(value: string) {
  const parts = value.trim().replace(',', '.').split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

export function parseTimestampedTranscript(value: string): TranscriptLine[] {
  const lines: TranscriptLine[] = []
  const rangePattern = /((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[,.]\d{1,3})?)\s*(?:-->|—|–|-|至)\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[,.]\d{1,3})?)/u
  let current: TranscriptLine | null = null
  const commit = () => {
    if (current && current.text.trim()) lines.push({ ...current, text: current.text.trim() })
    current = null
  }

  for (const row of value.replace(/\r/g, '').split('\n').map((item) => item.trim()).filter(Boolean)) {
    const range = row.match(rangePattern)
    if (range) {
      commit()
      const start = parseTimecode(range[1])
      const end = parseTimecode(range[2])
      if (start !== null && end !== null && end > start) {
        const text = row.slice((range.index ?? 0) + range[0].length).trim()
        current = { start, end, text }
      }
      continue
    }
    if (/^\d+$/.test(row)) continue
    if (current) current.text = `${current.text} ${row}`.trim()
  }
  commit()

  if (!lines.length) throw new Error('没有识别到时间码。请粘贴 SRT，或每段使用“00:00 - 00:05 文本”的格式。')
  return lines.sort((a, b) => a.start - b.start)
}
