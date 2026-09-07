import type { Briefing } from './handoff'
import type { TranscriptLine } from './transcription'

export type CodexEditContext = {
  sourceMedia: string
  briefing: Briefing
  transcript: TranscriptLine[]
  hasActualTranscript: boolean
}

export function buildCodexEditPrompt(context: CodexEditContext) {
  const transcript = context.transcript.map(({ start, end, text }) => ({ start, end, text }))
  const evidenceLabel = context.hasActualTranscript ? '真实本地转写' : '演示文稿（不可用于实剪）'

  return `请使用 rfg-cut-agent 协助我完成一条中文口播/采访的初剪。\n\n工作规则：\n1. 先调用 rfg_cut_create_review_plan，根据下面的 Brief 和逐字稿生成可复核计划。\n2. 将高光、口癖、停顿和疑似换气口列成待确认项目，并解释每项理由。\n3. 不要直接删除内容、不要渲染视频；只有我明确确认片段后，才调用 rfg_cut_render_rough_cut。\n4. 优先保留自然表达和语义完整度。\n\n项目上下文（${evidenceLabel}）：\n${JSON.stringify({ sourceMedia: context.sourceMedia, briefing: context.briefing, transcript }, null, 2)}`
}
