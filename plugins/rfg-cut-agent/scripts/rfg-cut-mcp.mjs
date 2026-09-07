#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const FILLER_PATTERN = /^(嗯+|呃+|额+|那个|就是|然后|对|其实|你知道|我觉得)[，,。.!！]?$/u

function jsonResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function jsonError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
}

function clampTranscript(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) throw new Error('需要至少一条带时间码的逐字稿。')
  if (transcript.length > 300) throw new Error('一次最多接受 300 条逐字稿，长片请先分段。')
  return transcript.map((line, index) => {
    const start = Number(line.start)
    const end = Number(line.end)
    const text = typeof line.text === 'string' ? line.text.trim() : ''
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
      throw new Error(`第 ${index + 1} 条逐字稿格式无效。`)
    }
    return { start, end, text }
  }).sort((a, b) => a.start - b.start)
}

function createReviewPlan({ sourceMedia = '未命名素材', briefing = {}, transcript }) {
  const lines = clampTranscript(transcript)
  const cleanupCandidates = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (FILLER_PATTERN.test(line.text)) {
      cleanupCandidates.push({ type: '口癖', start: line.start, end: line.end, text: line.text, reason: '短语义单位，建议先听上下文再决定是否删除。' })
    }
    const next = lines[index + 1]
    if (next) {
      const gap = Math.round((next.start - line.end) * 100) / 100
      if (gap >= 0.75) cleanupCandidates.push({ type: '停顿', start: line.end, end: next.start, reason: `间隔 ${gap} 秒，可能影响节奏；保留以维持表达时可不删除。` })
      else if (gap >= 0.2) cleanupCandidates.push({ type: '换气口', start: line.end, end: next.start, reason: `间隔 ${gap} 秒，默认保留，除非语速或节奏需要收紧。` })
    }
  }

  const chunkSize = Math.max(1, Math.ceil(lines.length / 3))
  const highlights = []
  for (let index = 0; index < lines.length; index += chunkSize) {
    const group = lines.slice(index, index + chunkSize)
    const first = group[0]
    const last = group[group.length - 1]
    highlights.push({
      id: `highlight-${highlights.length + 1}`,
      start: first.start,
      end: last.end,
      title: first.text.slice(0, 34),
      reason: '基于连续表达自动分组；请由 Codex 结合 Brief 判断是否形成完整叙事。',
      transcript: group.map((line) => line.text).join(''),
    })
  }

  return {
    kind: 'rfg-cut-review-plan/v1',
    sourceMedia,
    briefing,
    reviewRequired: true,
    highlights,
    cleanupCandidates,
    nextStep: '请先确认需要保留的高光与需要删除的候选。确认后才可请求本地实剪。',
  }
}

function toolResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function renderRoughCut({ sourceFile, outputFile, segments }) {
  if (typeof sourceFile !== 'string' || typeof outputFile !== 'string') throw new Error('sourceFile 和 outputFile 必须是文件路径。')
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 20) throw new Error('需要 1–20 个确认片段。')
  const source = resolve(sourceFile)
  const output = resolve(outputFile)
  if (!existsSync(source)) throw new Error(`找不到源文件：${source}`)
  if (existsSync(output)) throw new Error(`输出文件已存在，为避免覆盖已拒绝：${output}`)
  const verifiedSegments = segments.map((segment, index) => {
    const start = Number(segment.start)
    const end = Number(segment.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error(`第 ${index + 1} 个确认片段无效。`)
    return { start, end }
  })
  const filters = verifiedSegments.flatMap(({ start, end }, index) => [
    `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`,
    `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`,
  ])
  const joined = verifiedSegments.map((_, index) => `[v${index}][a${index}]`).join('')
  filters.push(`${joined}concat=n=${verifiedSegments.length}:v=1:a=1[outv][outa]`)
  const args = ['-i', source, '-filter_complex', filters.join(';'), '-map', '[outv]', '-map', '[outa]', '-movflags', '+faststart', output]
  return new Promise((resolveRender, rejectRender) => {
    const process = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    process.stderr.on('data', (chunk) => { stderr += chunk })
    process.on('error', (error) => rejectRender(error))
    process.on('close', (code) => {
      if (code === 0) resolveRender({ kind: 'rfg-cut-rough-cut/v1', outputFile: output, segments: verifiedSegments, message: '已生成初剪。请完整观看并核验语义、呼吸和画面衔接后再发布。' })
      else rejectRender(new Error(`FFmpeg 渲染失败（退出码 ${code}）：${stderr.slice(-700)}`))
    })
  })
}

const tools = [
  {
    name: 'rfg_cut_create_review_plan',
    description: 'Normalize a Chinese talking-head or interview transcript into reviewable highlight and cleanup candidates. This does not edit or render media.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceMedia: { type: 'string', description: 'A label or source filename.' },
        briefing: { type: 'object', description: 'Goal, audience, key message, and CTA.' },
        transcript: { type: 'array', description: 'Timestamped transcript lines.', items: { type: 'object', properties: { start: { type: 'number' }, end: { type: 'number' }, text: { type: 'string' } }, required: ['start', 'end', 'text'] } },
      },
      required: ['transcript'],
    },
  },
  {
    name: 'rfg_cut_render_rough_cut',
    description: 'Render explicitly confirmed source-video segments into a new local MP4 using FFmpeg. Never use this until the user has confirmed the exact ranges.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceFile: { type: 'string', description: 'Existing local video file path with audio.' },
        outputFile: { type: 'string', description: 'New MP4 path. Existing files are refused.' },
        segments: { type: 'array', items: { type: 'object', properties: { start: { type: 'number' }, end: { type: 'number' } }, required: ['start', 'end'] } },
      },
      required: ['sourceFile', 'outputFile', 'segments'],
    },
  },
]

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
input.on('line', async (line) => {
  let request
  try {
    request = JSON.parse(line)
    const { id, method, params = {} } = request
    if (method === 'notifications/initialized') return
    if (method === 'initialize') {
      console.log(jsonResponse(id, { protocolVersion: params.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'rfg-cut', version: '0.1.0' } }))
      return
    }
    if (method === 'tools/list') {
      console.log(jsonResponse(id, { tools }))
      return
    }
    if (method === 'tools/call') {
      const handler = params.name === 'rfg_cut_create_review_plan'
        ? () => createReviewPlan(params.arguments ?? {})
        : params.name === 'rfg_cut_render_rough_cut'
          ? () => renderRoughCut(params.arguments ?? {})
          : null
      if (!handler) throw new Error(`未知工具：${params.name}`)
      const result = await handler()
      console.log(jsonResponse(id, toolResult(result)))
      return
    }
    console.log(jsonError(id, -32601, `未实现的方法：${method}`))
  } catch (error) {
    console.log(jsonError(request?.id ?? null, -32000, error instanceof Error ? error.message : 'RFG Cut 工具失败。'))
  }
})
