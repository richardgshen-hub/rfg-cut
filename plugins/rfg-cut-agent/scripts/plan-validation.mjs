const text = (value) => typeof value === 'string' ? value.trim() : ''
const normalizedText = (value) => text(value).normalize('NFC').replace(/\s+/gu, '')

export function validateTranscript(transcript, duration = Infinity) {
  if (!Array.isArray(transcript) || transcript.length < 1 || transcript.length > 10_000) throw new Error('需要 1–10000 条带时间码的真实逐字稿。')
  let previousStart = -1
  let previousEnd = -1
  return transcript.map((line, index) => {
    const { start, end } = line ?? {}
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start < previousStart || start < previousEnd - 0.001 || end <= start || end > duration + 0.03 || !text(line.text)) {
      throw new Error(`第 ${index + 1} 条逐字稿的时间码、顺序或文字无效。`)
    }
    previousStart = start
    previousEnd = end
    return { id: text(line.id) || `line-${index + 1}`, start, end: Math.min(end, duration), text: text(line.text) }
  })
}

export function requireEvidence(context) {
  if (!context || context.hasActualTranscript !== true || !text(context.sourceId) || !text(context.contextId)) {
    throw new Error('请在 RFG Cut 中导入真实素材、完成带时间码的逐字稿，然后重新交给 Codex；演示稿不能作为剪辑依据。')
  }
  return validateTranscript(context.transcript, context.duration)
}

export function sourceRange(beat, lines, index) {
  const { start, end } = beat ?? {}
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error(`第 ${index + 1} 个片段时间码无效。`)
  const first = lines.findIndex((line) => Math.abs(line.start - start) < 0.025)
  const last = lines.findLastIndex((line) => Math.abs(line.end - end) < 0.025)
  if (first < 0 || last < first) throw new Error(`第 ${index + 1} 个片段必须使用完整原稿行的起止时间；当前没有逐词切点证据。`)
  const selected = lines.slice(first, last + 1)
  if (selected.some((line) => line.start < start - 0.025 || line.end > end + 0.025)) throw new Error(`第 ${index + 1} 个片段与原稿边界不一致。`)
  const sourceText = selected.map((line) => line.text).join(' ')
  if (beat.sourceText !== undefined && normalizedText(beat.sourceText) !== normalizedText(sourceText)) throw new Error(`第 ${index + 1} 个片段的引语与原稿不符。请保留对应时间范围的完整原话。`)
  return { start: selected[0].start, end: selected.at(-1).end, sourceText }
}

export function validateNarrativePlan(input, context) {
  const lines = requireEvidence(context)
  if (!text(input.title) || !text(input.summary)) throw new Error('计划需要标题和内容摘要。')
  if (!Array.isArray(input.beats) || !input.beats.length || input.beats.length > 100) throw new Error('计划需要 1–100 个有原稿依据的片段。')
  if (input.warnings !== undefined && (!Array.isArray(input.warnings) || input.warnings.some((item) => typeof item !== 'string'))) throw new Error('注意事项必须为文字列表。')
  const beats = input.beats.map((beat, index) => {
    if (!text(beat.role) || !text(beat.editReason)) throw new Error(`第 ${index + 1} 个片段缺少叙事作用或编辑理由。`)
    return { id: `beat-${index + 1}`, ...sourceRange(beat, lines, index), role: text(beat.role), editReason: text(beat.editReason) }
  })
  return { kind: 'rfg-cut-narrative-plan/v1', contextId: context.contextId, projectId: context.projectId, sourceId: context.sourceId,
    sourceMedia: context.sourceMedia, title: text(input.title), summary: text(input.summary), targetScript: context.targetScript || '',
    reviewRequired: true, beats, warnings: (input.warnings ?? []).map(text).filter(Boolean),
    nextStep: text(input.nextStep) || '逐段试听并确认成稿顺序，再导出初剪。' }
}

export function createReviewPlan(context) {
  const lines = requireEvidence(context)
  const cleanupCandidates = []
  const filler = /^(嗯+|呃+|额+|那个|就是|然后|对|其实|你知道|我觉得)[，,。.!！]?$/u
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (filler.test(line.text)) cleanupCandidates.push({ type: '口癖', start: line.start, end: line.end, text: line.text, reason: '可能是口癖，请先试听并确认没有承担转折或回答作用。' })
    const next = lines[index + 1]
    const gap = next ? next.start - line.end : 0
    if (gap >= 0.2) cleanupCandidates.push({ type: gap >= 0.75 ? '停顿' : '换气口', start: line.end, end: next.start, reason: `相邻转写间隔 ${gap.toFixed(2)} 秒；时间间隔不等于实际静音，需试听。` })
  }
  return { kind: 'rfg-cut-review-plan/v1', contextId: context.contextId, projectId: context.projectId, sourceId: context.sourceId,
    sourceMedia: context.sourceMedia, reviewRequired: true,
    highlights: [], cleanupCandidates,
    nextStep: '以上为节奏候选。请由 Codex 读完整篇原稿，发布有编辑理由的叙事计划；候选不代表已删除。' }
}

export function validateReviewPlan(input, context) {
  const lines = requireEvidence(context)
  if (input.kind !== 'rfg-cut-review-plan/v1' || input.reviewRequired !== true) throw new Error('只接受待复核的剪辑计划。')
  if (!Array.isArray(input.highlights) || !Array.isArray(input.cleanupCandidates)) throw new Error('剪辑计划格式错误。')
  const highlights = input.highlights.map((item, index) => ({ ...item, ...sourceRange({ ...item, sourceText: item.transcript }, lines, index) }))
  const cleanupCandidates = input.cleanupCandidates.map((item, index) => {
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end <= item.start || item.end > context.duration + 0.03) throw new Error(`第 ${index + 1} 个清理候选超出素材范围。`)
    return { type: text(item.type), start: item.start, end: item.end, text: text(item.text), reason: text(item.reason) }
  })
  return { ...input, contextId: context.contextId, projectId: context.projectId, sourceId: context.sourceId, sourceMedia: context.sourceMedia, highlights, cleanupCandidates }
}
