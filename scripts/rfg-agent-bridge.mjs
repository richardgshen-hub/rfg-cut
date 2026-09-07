#!/usr/bin/env node

import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = 8787
const maxBodySize = 1_000_000
let session = { revision: 0, updatedAt: null, context: null, reviewPlan: null, narrativePlan: null }

function allowedOrigin(origin) {
  return origin === 'http://127.0.0.1:5173' || origin === 'http://localhost:5173' ? origin : 'http://127.0.0.1:5173'
}

function send(response, statusCode, payload, origin) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': allowedOrigin(origin),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  response.end(JSON.stringify(payload))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > maxBodySize) reject(new Error('请求过大'))
    })
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('请求不是有效 JSON')) }
    })
    request.on('error', reject)
  })
}

function update(values) {
  session = { ...session, ...values, revision: session.revision + 1, updatedAt: new Date().toISOString() }
  return session
}

createServer(async (request, response) => {
  const origin = request.headers.origin
  if (request.method === 'OPTIONS') return send(response, 204, {}, origin)
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true, localOnly: true }, origin)
  if (request.method === 'GET' && request.url === '/session') return send(response, 200, session, origin)
  try {
    const body = await readJson(request)
    if (request.method === 'POST' && request.url === '/session') {
      if (!body.context || typeof body.context !== 'object') throw new Error('缺少项目上下文')
      return send(response, 200, update({ context: body.context, reviewPlan: null, narrativePlan: null }), origin)
    }
    if (request.method === 'POST' && request.url === '/plan') {
      if (body.reviewPlan?.kind !== 'rfg-cut-review-plan/v1' || body.reviewPlan.reviewRequired !== true) throw new Error('只接受待复核的 RFG Cut 计划')
      return send(response, 200, update({ reviewPlan: body.reviewPlan }), origin)
    }
    if (request.method === 'POST' && request.url === '/narrative-plan') {
      if (body.narrativePlan?.kind !== 'rfg-cut-narrative-plan/v1' || body.narrativePlan.reviewRequired !== true) throw new Error('只接受待复核的 RFG Cut 叙事计划')
      return send(response, 200, update({ narrativePlan: body.narrativePlan }), origin)
    }
    return send(response, 404, { error: '未找到本机桥接路由' }, origin)
  } catch (error) {
    return send(response, 400, { error: error instanceof Error ? error.message : '本机桥接失败' }, origin)
  }
}).listen(port, host, () => {
  console.log(`RFG Cut bridge listening on http://${host}:${port}`)
})
