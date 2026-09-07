import type { Briefing } from './handoff'
import type { TranscriptLine } from './transcription'

export type CodexEditContext = {
  sourceMedia: string
  briefing: Briefing
  transcript: TranscriptLine[]
  hasActualTranscript: boolean
  targetScript?: string
}

export function buildCodexEditPrompt(context: CodexEditContext) {
  const transcript = context.transcript.map(({ start, end, text }) => ({ start, end, text }))
  const evidenceLabel = context.hasActualTranscript ? '真实本地转写' : '演示文稿（不可用于实剪）'

  return `请使用 rfg-cut-agent 协助我完成一条中文口播/采访的初剪。\n\n工作规则：\n1. 先调用 rfg_cut_create_review_plan，根据下面的 Brief、逐字稿和目标成稿生成可复核计划。\n2. 将高光、口癖、停顿和疑似换气口列成待确认项目，并解释每项理由。\n3. 若提供目标成稿，优先按其叙事顺序找对应原话；不要编造原片没有说过的事实或引语。\n4. 不要直接删除内容、不要渲染视频；只有我明确确认片段后，才调用 rfg_cut_render_rough_cut。\n5. 优先保留自然表达和语义完整度。\n\n项目上下文（${evidenceLabel}）：\n${JSON.stringify({ sourceMedia: context.sourceMedia, briefing: context.briefing, targetScript: context.targetScript || undefined, transcript }, null, 2)}`
}

export function buildCodexNarrativePrompt(context: CodexEditContext) {
  const transcript = context.transcript.map(({ start, end, text }) => ({ start, end, text }))
  return `请使用 rfg-cut-agent 把一段可能散乱的中文采访/口播，整理成一段自然、连贯、可落剪的叙事。\n\n你的职责是内容编辑，不是自动删片：\n1. 先通读逐字稿，提炼讲述者真正表达的主线；可以重排原话，但不可编造原片没有表达过的事实、观点或直接引语。\n2. 目标成稿是优先方向；若原片无法支撑，明确标出“需补录/字幕补充”，不要硬拼。\n3. 选择 3–10 个原片片段，按开场—展开—收束排成顺序。每段写清原始起止时间、该段在叙事中的作用、保留的原话和编辑理由。\n4. 所有建议必须人工复核；不要调用渲染工具。\n5. 最后调用 rfg_cut_publish_narrative_plan，把你整理出的标题、摘要、节拍、风险提示和下一步回传 RFG Cut。\n\n项目上下文：\n${JSON.stringify({ sourceMedia: context.sourceMedia, briefing: context.briefing, targetScript: context.targetScript || '未提供目标成稿，请从口播中提炼主线。', transcript }, null, 2)}`
}
