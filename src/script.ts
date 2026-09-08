import type { TranscriptLine } from './transcription.ts'
import { validateTranscript } from './project.ts'

const rangePattern = /^\[?([+-]?\d[\d:,.]*)\s*(?:-->|—|–|-|至)\s*([+-]?\d[\d:,.]*)\]?\s*(.*)$/u

function parseTimecode(value: string): number | null {
  if (!/^\d+:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?$/u.test(value)) return null
  const parts = value.replace(',', '.').split(':').map(Number)
  const seconds = parts.at(-1)!
  if (seconds >= 60 || (parts.length === 3 && parts[1] >= 60)) return null
  const total = parts.length === 2 ? parts[0] * 60 + seconds : parts[0] * 3600 + parts[1] * 60 + seconds
  return Number.isFinite(total) ? total : null
}

/** A timestamped source transcript is evidence; plain prose belongs in targetScript. */
export function parseTimestampedTranscript(value: string, duration?: number): TranscriptLine[] {
  const rows = value.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').split('\n').map((row) => row.trim())
  const isVtt = /^WEBVTT(?:\s|$)/u.test(rows[0] ?? '')
  const lines: TranscriptLine[] = []
  let current: TranscriptLine | null = null
  let ignoringVttBlock = false
  const commit = () => {
    if (!current) return
    if (!current.text.trim()) throw new Error('有时间码段落没有对应原话，请补齐文本。')
    lines.push({ ...current, text: current.text.trim() })
    current = null
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (!row) { ignoringVttBlock = false; continue }
    if (index === 0 && isVtt) continue
    if (ignoringVttBlock) continue
    if (isVtt && /^(?:NOTE(?:\s|$)|STYLE$|REGION$)/u.test(row)) { commit(); ignoringVttBlock = true; continue }
    if (isVtt && !current && !lines.length && /^(?:Kind|Language):/u.test(row)) continue
    const range = row.match(rangePattern)
    if (range) {
      commit()
      const start = parseTimecode(range[1])
      const end = parseTimecode(range[2])
      if (start === null || end === null || end <= start) throw new Error(`第 ${index + 1} 行时间码无效：请使用非负时间，秒数小于 60，结束晚于开始。`)
      // WebVTT placement settings are metadata, never spoken words.
      const text = isVtt ? range[3].replace(/^(?:(?:vertical|line|position|size|align|region):\S+\s*)+/u, '') : range[3]
      current = { start, end, text }
      continue
    }
    // Malformed ranges must not become text attached to the last valid cue.
    // oxlint-disable-next-line no-useless-escape -- escaped `[` is intentional in this character class.
    if (/-->|^[\[+-]?\d[\d:,.]*\s*(?:—|–|至|\s-\s)|^[\[+-]?\d+:\d.*-/u.test(row)) throw new Error(`第 ${index + 1} 行无法解析时间范围，请检查完整的起止时间码。`)
    // A numeric line is an index only directly before a timing line. Spoken
    // numbers such as “2026” after a timestamp remain in the transcript.
    const next = rows[index + 1] ?? ''
    const atBlockStart = index === 0 || rows[index - 1] === ''
    if (atBlockStart && rangePattern.test(next) && (/^\d+$/u.test(row) || isVtt)) continue
    if (!current) throw new Error('没有识别到完整时间码。原稿请使用 SRT、VTT 或“00:00 - 00:05 文本”；纯文字请放入目标成稿。')
    current.text = `${current.text}${current.text ? '\n' : ''}${row}`
  }
  commit()
  if (!lines.length) throw new Error('没有识别到时间码。请导入 SRT、VTT，或每段使用“00:00 - 00:05 文本”。')
  const ordered = lines.sort((left, right) => left.start - right.start)
  const errors = validateTranscript(ordered, duration)
  if (errors.length) throw new Error(errors.join('；'))
  return ordered
}
