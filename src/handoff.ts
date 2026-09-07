export type Briefing = {
  goal: string
  audience: string
  keyMessage: string
  callToAction: string
}

import type { TranscriptLine } from './transcription'

export type HandoffCandidate = {
  id: string
  title: string
  start: string
  end: string
  duration: string
  note: string
  enabled: boolean
}

type HandoffInput = {
  projectName: string
  sourceMedia: string
  briefing: Briefing
  transcript: TranscriptLine[]
  candidates: HandoffCandidate[]
  cleanRules: Record<string, boolean>
}

export function createHandoffPack(input: HandoffInput) {
  return {
    format: 'rfg-cut-handoff/v1',
    generatedAt: new Date().toISOString(),
    project: { name: input.projectName, sourceMedia: input.sourceMedia },
    briefing: input.briefing,
    transcript: input.transcript,
    editDecisions: {
      cleanup: input.cleanRules,
      selectedHighlights: input.candidates.filter((candidate) => candidate.enabled),
    },
    jianyingHandoff: {
      mode: 'review-first',
      note: '此文件是给剪映人工复核和落剪用的交接包，不会直接改写剪映草稿工程。',
      checklist: ['导入原片后按时间码定位', '复核每个删除建议和切气口', '保留选中的高光段落', '再使用剪映完成字幕、包装和最终导出'],
    },
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
