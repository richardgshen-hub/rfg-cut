import type { Briefing } from './handoff.ts'
import type { TranscriptLine } from './transcription.ts'

export type { Briefing, TranscriptLine }

export type EditSegment = {
  id: string
  start: number
  end: number
  text: string
  reason: string
  enabled: boolean
  confirmed: boolean
}

export type MediaSource = {
  id: string
  name: string
  duration: number
  hasVideo: boolean
  hasAudio: boolean
  url: string
  audioUrl?: string
}

export type Project = {
  schemaVersion: 1
  id: string
  name: string
  source: MediaSource | null
  transcript: TranscriptLine[]
  targetScript: string
  briefing: Briefing
  segments: EditSegment[]
  warnings: string[]
  updatedAt: string
}

export function createProject(name = '未命名采访'): Project {
  return {
    schemaVersion: 1,
    id: globalThis.crypto.randomUUID(),
    name,
    source: null,
    transcript: [],
    targetScript: '',
    briefing: { goal: '', audience: '', keyMessage: '', callToAction: '' },
    segments: [],
    warnings: [],
    updatedAt: new Date().toISOString(),
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式无效。`)
  return value as Record<string, unknown>
}

function string(value: unknown, label: string, allowEmpty = true): string {
  if (typeof value !== 'string' || value.length > 1_000_000 || (!allowEmpty && !value.trim())) throw new Error(`${label}必须是有效文本。`)
  return value
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label}必须是有效的非负秒数。`)
  return value
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label}必须是布尔值。`)
  return value
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > 50_000) throw new Error(`${label}必须是有效列表。`)
  return value
}

export function validateTranscript(transcript: TranscriptLine[], duration?: number): string[] {
  const errors: string[] = []
  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) return ['素材时长无效，请重新导入素材。']
  const sorted = [...transcript].sort((left, right) => left.start - right.start)
  let precedingEnd = 0
  for (let index = 0; index < sorted.length; index += 1) {
    const line = sorted[index]
    if (!Number.isFinite(line.start) || !Number.isFinite(line.end) || line.start < 0 || line.end <= line.start) errors.push(`第 ${index + 1} 段原稿的时间范围无效。`)
    if (typeof line.text !== 'string' || !line.text.trim()) errors.push(`第 ${index + 1} 段原稿缺少文本。`)
    if (duration !== undefined && line.end > duration + 0.001) errors.push(`第 ${index + 1} 段原稿超出素材时长，请核对原稿与素材。`)
    if (index && line.start < precedingEnd - 0.001) errors.push(`第 ${index + 1} 段原稿与上一段时间重叠，请先校正。`)
    precedingEnd = Math.max(precedingEnd, line.end)
  }
  return errors
}

/** Strictly reconstruct persisted data; never trust imported JSON as live state. */
export function parseProject(value: unknown): Project {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { throw new Error('项目文件不是有效的 JSON。') }
  }
  const input = record(value, '项目')
  if (input.schemaVersion !== 1) throw new Error('不支持此项目版本。请导入 RFG Cut v1 项目文件。')
  const briefing = record(input.briefing, 'Brief')
  let source: MediaSource | null = null
  if (input.source !== null) {
    const raw = record(input.source, '素材')
    source = {
      id: string(raw.id, '素材 ID', false), name: string(raw.name, '素材名称', false), duration: number(raw.duration, '素材时长'),
      hasVideo: boolean(raw.hasVideo, '视频轨标记'), hasAudio: boolean(raw.hasAudio, '音轨标记'), url: string(raw.url, '素材地址', false),
      ...(raw.audioUrl === undefined ? {} : { audioUrl: string(raw.audioUrl, '转写音轨地址', false) }),
    }
    if (source.duration <= 0 || (!source.hasAudio && !source.hasVideo)) throw new Error('素材需要有效时长和至少一条媒体轨道。')
  }
  const transcript = array(input.transcript, '原始逐字稿').map((entry) => {
    const raw = record(entry, '逐字稿段落')
    return { start: number(raw.start, '原稿开始时间'), end: number(raw.end, '原稿结束时间'), text: string(raw.text, '原稿文本', false) }
  }).sort((left, right) => left.start - right.start)
  const transcriptErrors = validateTranscript(transcript, source?.duration)
  if (transcriptErrors.length) throw new Error(transcriptErrors.join('；'))
  const ids = new Set<string>()
  const segments = array(input.segments, '剪辑片段').map((entry) => {
    const raw = record(entry, '剪辑片段')
    const segment: EditSegment = {
      id: string(raw.id, '片段 ID', false), start: number(raw.start, '片段开始时间'), end: number(raw.end, '片段结束时间'),
      text: string(raw.text, '片段原话', false), reason: string(raw.reason, '编辑理由'),
      enabled: boolean(raw.enabled, '片段启用标记'), confirmed: boolean(raw.confirmed, '片段确认标记'),
    }
    if (ids.has(segment.id)) throw new Error('项目包含重复的片段 ID。')
    ids.add(segment.id)
    if (segment.end <= segment.start || (source && segment.end > source.duration + 0.001)) throw new Error('剪辑片段时间无效或超出素材时长。')
    return segment
  })
  const updatedAt = string(input.updatedAt, '保存时间', false)
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error('项目保存时间无效。')
  return {
    schemaVersion: 1, id: string(input.id, '项目 ID', false), name: string(input.name, '项目名称', false), source, transcript,
    targetScript: string(input.targetScript, '目标成稿'),
    briefing: {
      goal: string(briefing.goal, '视频目标'), audience: string(briefing.audience, '目标受众'),
      keyMessage: string(briefing.keyMessage, '核心表达'), callToAction: string(briefing.callToAction, '观众行动'),
    },
    segments, warnings: array(input.warnings, '项目提示').map((entry) => string(entry, '项目提示')), updatedAt,
  }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(parseProject(project), null, 2)
}
