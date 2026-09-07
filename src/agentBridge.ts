import type { CodexEditContext } from './codexAgent'

const bridgeUrl = 'http://127.0.0.1:8787'

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

async function localRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${bridgeUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  if (!response.ok) throw new Error(`本机桥接服务返回 ${response.status}`)
  return response.json() as Promise<AgentBridgeSession>
}

export function publishAgentContext(context: CodexEditContext) {
  return localRequest('/session', { method: 'POST', body: JSON.stringify({ context }) })
}

export function readAgentSession() {
  return localRequest('/session')
}
