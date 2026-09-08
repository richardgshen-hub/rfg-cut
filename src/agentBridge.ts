import type { Briefing } from './handoff'
import type { TranscriptLine } from './transcription'

export type CodexEditContext = {
  projectId?: string
  sourceId?: string
  contextId?: string
  sourceMedia: string
  briefing: Briefing
  transcript: TranscriptLine[]
  hasActualTranscript: boolean
  targetScript?: string
}

export type AgentCleanupCandidate = { type: string; start: number; end: number; reason: string; text?: string }
export type AgentHighlight = { id: string; start: number; end: number; title: string; reason: string; transcript: string }
export type AgentReviewPlan = {
  kind: 'rfg-cut-review-plan/v1'
  sourceMedia: string
  reviewRequired: true
  highlights: AgentHighlight[]
  cleanupCandidates: AgentCleanupCandidate[]
  nextStep: string
}

export type AgentNarrativeBeat = {
  id: string
  start: number
  end: number
  role: string
  sourceText: string
  editReason: string
}

export type AgentNarrativePlan = {
  kind: 'rfg-cut-narrative-plan/v1'
  sourceMedia: string
  title: string
  summary: string
  targetScript: string
  reviewRequired: true
  beats: AgentNarrativeBeat[]
  warnings: string[]
  nextStep: string
}

export type AgentBridgeSession = {
  revision: number
  updatedAt: string | null
  context: CodexEditContext | null
  reviewPlan: AgentReviewPlan | null
  narrativePlan: AgentNarrativePlan | null
}
