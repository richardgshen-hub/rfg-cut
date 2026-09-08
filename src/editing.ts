import type { EditSegment } from './project.ts'
import { validateTranscript } from './project.ts'
import type { CleanupCandidate, TranscriptLine } from './transcription.ts'

export type ScriptMatch = {
  id: string
  targetText: string
  start: number | null
  end: number | null
  sourceText: string
  confidence: number
  status: 'matched' | 'ambiguous' | 'missing'
  reason: string
}

export type ScriptMatchResult = { matches: ScriptMatch[]; segments: EditSegment[]; warnings: string[] }
export type CleanupSuggestion = CleanupCandidate & { id: string; text: string; reviewRequired: true; precision: 'utterance' | 'gap' }

function tokenize(value: string): string[] {
  // Keep Latin word boundaries and contractions: "the rapist" != "therapist".
  return value.normalize('NFKC').toLowerCase().replace(/[’‘]/gu, "'").match(/[a-z]+(?:'[a-z]+)*|[+-]?\d+(?:[.,]\d+)?(?:%|‰)?|\p{L}|\p{N}/gu) ?? []
}

function normalized(value: string): string { return tokenize(value).join('\u001f') }

function bigrams(tokens: string[]): Set<string> {
  return new Set(tokens.length < 2 ? tokens : tokens.slice(1).map((token, index) => `${tokens[index]}\u001f${token}`))
}

function similarity(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0
  const a = bigrams(left)
  const b = bigrams(right)
  const shared = [...a].filter((item) => b.has(item)).length
  return (2 * shared / (a.size + b.size)) * (Math.min(left.length, right.length) / Math.max(left.length, right.length)) ** 0.2
}

function protectedDetails(value: string): string {
  return (value.normalize('NFKC').toLowerCase().match(/(?:不能|不要|没有|不会|不是|不得|不|没|无|未|别|否)|\b(?:not|no|never|without|\w+n't)\b|[+-]?\d+(?:[.,]\d+)?(?:%|‰|万|亿)?/gu) ?? []).join('|')
}

function intersects(left: { start: number; end: number }, right: { start: number; end: number }): boolean {
  return left.start < right.end - 0.001 && right.start < left.end - 0.001
}

export function buildSequentialSegments(transcript: TranscriptLine[]): EditSegment[] {
  const errors = validateTranscript(transcript)
  if (errors.length) throw new Error(errors.join('；'))
  return [...transcript].sort((left, right) => left.start - right.start).map((line, index) => ({
    id: `source-${index}-${line.start}-${line.end}`, ...line,
    reason: '保留原始发言顺序；按整段原话时间码取片，请试听衔接。', enabled: true, confirmed: false,
  }))
}

/** Exact utterance matching is actionable; approximate text is only a review lead. */
export function matchTargetScript(target: string, transcript: TranscriptLine[]): ScriptMatchResult {
  const errors = validateTranscript(transcript)
  if (errors.length) return { matches: [], segments: [], warnings: errors }
  const sentences = target.split(/(?<=[。！？!?；;])\s*|(?<=\.)\s+(?=[A-Z])|\n+/u).map((line) => line.trim()).filter((line) => tokenize(line).length)
  if (!sentences.length) return { matches: [], segments: [], warnings: ['请先填写目标成稿。'] }
  const ordered = [...transcript].sort((left, right) => left.start - right.start)
  const windows = ordered.flatMap((line, index) => {
    const candidates: { start: number; end: number; text: string; normalized: string; tokens: string[] }[] = []
    for (let count = 1; count <= 3 && index + count <= ordered.length; count += 1) {
      const slice = ordered.slice(index, index + count)
      const text = slice.map((entry) => entry.text).join('\n')
      candidates.push({ start: line.start, end: slice.at(-1)!.end, text, normalized: normalized(text), tokens: tokenize(text) })
    }
    return candidates
  })
  const segments: EditSegment[] = []
  const warnings: string[] = []
  const matches = sentences.map((targetText, index): ScriptMatch => {
    const id = `target-${index}`
    const tokens = tokenize(targetText)
    const key = tokens.join('\u001f')
    const candidates = windows.map((window) => ({ ...window, exact: window.normalized === key, confidence: window.normalized === key ? 1 : Math.min(0.94, similarity(tokens, window.tokens)) }))
      .filter((candidate) => candidate.confidence >= 0.44)
      .sort((left, right) => right.confidence - left.confidence || (left.end - left.start) - (right.end - right.start))
    const best = candidates[0]
    if (!best) return { id, targetText, start: null, end: null, sourceText: '', confidence: 0, status: 'missing', reason: '没有找到足够相近的原话；需要补录、改稿，或交给 Codex 做语义对齐。' }
    const exactChoices = candidates.filter((candidate) => candidate.exact)
    const duplicate = segments.some((segment) => intersects(segment, best))
    const detailMismatch = protectedDetails(targetText) !== protectedDetails(best.text)
    if (best.exact && exactChoices.length === 1 && !duplicate && !detailMismatch) {
      segments.push({ id, start: best.start, end: best.end, text: best.text, reason: '与目标成稿原话匹配，按目标稿顺序排列。', enabled: true, confirmed: false })
      return { id, targetText, start: best.start, end: best.end, sourceText: best.text, confidence: 1, status: 'matched', reason: '找到唯一对应原话；保留完整段落时间码，等待试听确认。' }
    }
    const multiple = exactChoices.length > 1 || (!best.exact && candidates[1] && best.confidence - candidates[1].confidence < 0.06)
    const reason = duplicate
      ? '这段原片已被前面的目标句使用。请决定是否需要重复，未自动重复加入。'
      : multiple
        ? '原片有多个相近位置，请试听并选择正确的一段。'
        : detailMismatch
          ? '相近原话的否定表达或数字不同，不能自动视为同义；请核对原意。'
          : '找到相近原话，但文字并不完全相同；整段时间码无法推断单字切点，请复核后选择。'
    return { id, targetText, start: multiple ? null : best.start, end: multiple ? null : best.end, sourceText: best.text, confidence: best.confidence, status: 'ambiguous', reason }
  })
  const missing = matches.filter((match) => match.status === 'missing').length
  const ambiguous = matches.filter((match) => match.status === 'ambiguous').length
  if (missing) warnings.push(`${missing} 句未找到原话，不会编造对应片段。`)
  if (ambiguous) warnings.push(`${ambiguous} 句需要人工或 Codex 复核，尚未加入可用片段。`)
  if (!transcript.length) warnings.push('目标成稿不是原片证据。请先导入有时间码的原稿或完成素材转写。')
  if (segments.length) warnings.push('匹配使用整段原话时间码。逐字切点与自然衔接仍需试听确认。')
  return { matches, segments, warnings }
}

/** Checks enabled output geometry; confirmation is a separate UI review gate. */
export function validateSegments(segments: EditSegment[], duration: number): string[] {
  const errors: string[] = []
  if (!Number.isFinite(duration) || duration <= 0) return ['素材时长无效，请重新导入素材。']
  const active = segments.filter((segment) => segment.enabled)
  if (!active.length) return ['请至少选择一个片段。']
  const ids = new Set<string>()
  for (const [index, segment] of active.entries()) {
    if (!segment.id || ids.has(segment.id)) errors.push(`第 ${index + 1} 个片段的标识为空或重复。`)
    ids.add(segment.id)
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start) errors.push(`第 ${index + 1} 个片段的时间范围无效。`)
    if (segment.end > duration + 0.001) errors.push(`第 ${index + 1} 个片段超出原片时长。`)
  }
  const sorted = [...active].sort((left, right) => left.start - right.start)
  let furthestEnd = -Infinity
  for (const segment of sorted) {
    if (segment.start < furthestEnd - 0.001) errors.push('所选片段包含重复或重叠的原片范围，请调整切点以免重复播放。')
    furthestEnd = Math.max(furthestEnd, segment.end)
  }
  return [...new Set(errors)]
}

function srtTime(seconds: number): string {
  const millis = Math.max(0, Math.round(seconds * 1000))
  return `${String(Math.floor(millis / 3_600_000)).padStart(2, '0')}:${String(Math.floor(millis % 3_600_000 / 60_000)).padStart(2, '0')}:${String(Math.floor(millis % 60_000 / 1_000)).padStart(2, '0')},${String(millis % 1_000).padStart(3, '0')}`
}

/** Re-time original caption cues; do not invent word-level transcription. */
export function makeEditedSrt(segments: EditSegment[], transcript: TranscriptLine[]): string {
  const active = segments.filter((segment) => segment.enabled)
  if (!active.length) return ''
  const errors = [...validateTranscript(transcript), ...validateSegments(active, Math.max(...active.map((segment) => segment.end)))]
  if (errors.length) throw new Error(errors.join('；'))
  const ordered = [...transcript].sort((left, right) => left.start - right.start)
  const cues: TranscriptLine[] = []
  let cursor = 0
  for (const segment of active) {
    for (const line of ordered) {
      const start = Math.max(line.start, segment.start)
      const end = Math.min(line.end, segment.end)
      if (end - start < 0.001) continue
      cues.push({ start: cursor + start - segment.start, end: cursor + end - segment.start, text: line.text.trim() })
    }
    cursor += segment.end - segment.start
  }
  return cues.map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join('\n')
}

export function collectCleanupCandidates(transcript: TranscriptLine[]): CleanupSuggestion[] {
  const lines = [...transcript].sort((left, right) => left.start - right.start)
  const candidates: CleanupSuggestion[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/(?:^|[，。！？、\s])(嗯+|呃+|额+|啊+|这个|就是|然后|其实)(?=[，。！？、\s]|$)/u.test(line.text)) candidates.push({ id: `filler-${index}-${line.start}`, type: '口癖', start: line.start, end: line.end, text: line.text, note: '该原话可能含口癖。当前仅有整段时间码，需试听定位词语；不能直接删除整句。', reviewRequired: true, precision: 'utterance' })
    const next = lines[index + 1]
    if (!next) continue
    const gap = next.start - line.end
    if (gap < 0.2) continue
    candidates.push({
      id: `gap-${index}-${line.end}`, type: gap >= 0.75 ? '停顿' : '换气口', start: line.end, end: next.start, text: '', reviewRequired: true, precision: 'gap',
      note: gap >= 0.75 ? '转写时间码之间存在间隔，不等于已检测静音。请试听后决定是否压缩。' : '短转写间隔可能包含自然换气或漏识别的声音，请试听并默认保留。',
    })
  }
  return candidates
}
