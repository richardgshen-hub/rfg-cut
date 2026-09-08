import { createServer } from 'node:http'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { probeMedia, renderSegments, runProcess, validateSegments } from '../../plugins/rfg-cut-agent/scripts/media-engine.mjs'
import { validateNarrativePlan, validateReviewPlan, validateTranscript } from '../../plugins/rfg-cut-agent/scripts/plan-validation.mjs'

const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const emptySession = () => ({ revision: 0, contextId: null, updatedAt: null, context: null, reviewPlan: null, narrativePlan: null })
const errorWithStatus = (message, status = 400) => Object.assign(new Error(message), { status })
const validProjectId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)

async function readJson(request, maxBytes = 4_000_000) {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw errorWithStatus('需要 application/json 请求。', 415)
  if (Number(request.headers['content-length']) > maxBytes) { request.resume(); throw errorWithStatus('请求过大。', 413) }
  let length = 0
  const chunks = []
  for await (const chunk of request) {
    length += chunk.length
    if (length > maxBytes) throw errorWithStatus('请求过大。', 413)
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw errorWithStatus('请求不是有效 JSON。') }
}

export async function createRfgServer({ dataDir, maxUploadBytes = 8 * 1024 ** 3 } = {}) {
  if (!dataDir) throw new Error('需要本机数据目录。')
  const mediaDir = join(dataDir, 'media')
  const exportDir = join(dataDir, 'exports')
  await Promise.all([mkdir(mediaDir, { recursive: true, mode: 0o700 }), mkdir(exportDir, { recursive: true, mode: 0o700 })])
  const media = new Map()
  const jobs = new Map()
  const audioRequests = new Map()
  const writes = new Map()
  const controllers = new Set()
  let session = emptySession()
  let workerBusy = false
  let closing = false
  let health

  async function persist(path, payload) {
    const prior = writes.get(path) ?? Promise.resolve()
    const snapshot = JSON.stringify(payload)
    const next = prior.catch(() => {}).then(async () => {
      const temporary = `${path}.${randomUUID()}.tmp`
      await writeFile(temporary, snapshot, { mode: 0o600, flag: 'wx' })
      await rename(temporary, path)
    })
    writes.set(path, next)
    try { await next } finally { if (writes.get(path) === next) writes.delete(path) }
  }
  async function restore(directory, destination) {
    for (const name of await readdir(directory)) {
      if (!name.endsWith('.json') || !ID.test(name.slice(0, -5))) continue
      try {
        const entry = JSON.parse(await readFile(join(directory, name), 'utf8'))
        if (entry.id === name.slice(0, -5)) destination.set(entry.id, entry)
      } catch { /* Incomplete metadata cannot become a media or export target. */ }
    }
  }
  await Promise.all([restore(mediaDir, media), restore(exportDir, jobs)])
  for (const job of jobs.values()) {
    if (job.status === 'running' || job.status === 'queued') {
      Object.assign(job, { status: 'failed', error: '上次服务关闭时导出尚未完成，请重新导出。', updatedAt: new Date().toISOString() })
      await persist(join(exportDir, `${job.id}.json`), job)
    }
  }
  try { session = JSON.parse(await readFile(join(dataDir, 'session.json'), 'utf8')) } catch { /* First launch. */ }

  function send(response, status, payload, extra = {}) {
    if (response.destroyed || response.writableEnded) return
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra })
    response.end(JSON.stringify(payload))
  }
  function authorize(request, response) {
    let host
    try { host = new URL(`http://${request.headers.host}`).hostname } catch { throw errorWithStatus('无效的本机 Host。', 403) }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw errorWithStatus('本机服务只接受回环地址。', 403)
    const origin = request.headers.origin
    if (origin) {
      let parsed
      try { parsed = new URL(origin) } catch { throw errorWithStatus('不允许这个请求来源。', 403) }
      const allowedPorts = new Set(['5173', '4173', String(server.address()?.port)])
      if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !allowedPorts.has(parsed.port)) throw errorWithStatus('不允许这个请求来源。', 403)
      response.setHeader('access-control-allow-origin', origin)
      response.setHeader('vary', 'origin')
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
      response.setHeader('access-control-allow-headers', 'content-type, range')
    }
  }
  async function getHealth() {
    if (!health) {
      const checks = await Promise.allSettled(['ffmpeg', 'ffprobe'].map((command) => runProcess(command, ['-version'], { timeout: 5000 })))
      health = { ok: true, localOnly: true, version: '0.2.0', ffmpeg: checks[0].status === 'fulfilled', ffprobe: checks[1].status === 'fulfilled' }
    }
    return health
  }
  function findMedia(id) {
    if (!ID.test(id) || !media.has(id)) throw errorWithStatus('素材不存在，请重新导入。', 404)
    return media.get(id)
  }
  async function streamFile(request, response, path, contentType, attachment) {
    let info
    try { info = await stat(path) } catch { throw errorWithStatus('文件不存在，请重新导入或导出。', 404) }
    let start = 0
    let end = info.size - 1
    let status = 200
    const headers = { 'content-type': contentType, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=0', 'x-content-type-options': 'nosniff' }
    if (attachment) headers['content-disposition'] = `attachment; filename="${attachment}"`
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range)
      if (!match || (!match[1] && !match[2])) return send(response, 416, { error: '无效的文件范围。' }, { 'content-range': `bytes */${info.size}` })
      if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end }
      else start = Math.max(0, info.size - Number(match[2]))
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= info.size) return send(response, 416, { error: '文件范围越界。' }, { 'content-range': `bytes */${info.size}` })
      status = 206
      headers['content-range'] = `bytes ${start}-${end}/${info.size}`
    }
    headers['content-length'] = String(end - start + 1)
    response.writeHead(status, headers)
    const stream = createReadStream(path, { start, end })
    response.on('close', () => stream.destroy())
    stream.on('error', () => response.destroy())
    stream.pipe(response)
  }
  async function updateSession(values) {
    session = { ...session, ...values, revision: session.revision + 1, updatedAt: new Date().toISOString() }
    await persist(join(dataDir, 'session.json'), session)
    return session
  }
  function checkContext(body) {
    if (!body.contextId || body.contextId !== session.contextId || !session.context) throw errorWithStatus('项目已发生变化。请重新读取当前上下文，再生成计划。', 409)
    if (body.projectId && body.projectId !== session.context.projectId) throw errorWithStatus('计划不属于当前项目。', 409)
    if (body.sourceId && body.sourceId !== session.context.sourceId) throw errorWithStatus('计划不属于当前素材。', 409)
    return session.context
  }
  async function saveJob(job) {
    job.updatedAt = new Date().toISOString()
    await persist(join(exportDir, `${job.id}.json`), job)
  }
  async function processJobs() {
    if (workerBusy || closing) return
    const job = [...jobs.values()].find((item) => item.status === 'queued')
    if (!job) return
    workerBusy = true
    const controller = new AbortController()
    controllers.add(controller)
    try {
      const source = findMedia(job.sourceId)
      job.status = 'running'
      await saveJob(job)
      const rendered = await renderSegments(join(mediaDir, `${source.id}.media`), join(exportDir, `${job.id}.mp4`), job.segments, source, { signal: controller.signal, onProgress: (progress) => { job.progress = progress } })
      Object.assign(job, { status: 'completed', progress: 1, duration: rendered.duration, url: `/api/exports/${job.id}/download` })
    } catch (error) {
      Object.assign(job, { status: 'failed', error: closing ? '服务已关闭，请重新导出。' : error.message })
      await unlink(join(exportDir, `${job.id}.mp4`)).catch(() => {})
    } finally {
      await saveJob(job)
      controllers.delete(controller)
      workerBusy = false
      if (!closing) void processJobs()
    }
  }
  const server = createServer(async (request, response) => {
    try {
      authorize(request, response)
      const url = new URL(request.url, 'http://127.0.0.1')
      const path = url.pathname.startsWith('/api/') ? url.pathname.slice(4) : url.pathname
      if (request.method === 'OPTIONS') return send(response, 204, {})
      if (request.method === 'GET' && path === '/health') return send(response, 200, await getHealth())
      if (request.method === 'GET' && path === '/session') return send(response, 200, session)
      if (request.method === 'POST' && path === '/media') {
        if (!(await getHealth()).ffprobe) throw errorWithStatus('缺少 FFmpeg 工具，请安装 FFmpeg 后重启服务。', 503)
        if (Number(request.headers['content-length']) > maxUploadBytes) { request.resume(); throw errorWithStatus('素材超过 8 GB 上传上限。', 413) }
        const id = randomUUID()
        const temporary = join(mediaDir, `${id}.upload`)
        const destination = join(mediaDir, `${id}.media`)
        let size = 0
        try {
          await pipeline(request, new Transform({ transform(chunk, encoding, callback) { size += chunk.length; callback(size > maxUploadBytes ? errorWithStatus('素材超过上传上限。', 413) : null, chunk) } }), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
          if (!size) throw errorWithStatus('素材文件为空。')
          const probe = await probeMedia(temporary)
          if (probe.duration > 21_600) throw errorWithStatus('单个素材最长支持 6 小时。')
          // oxlint-disable-next-line no-control-regex -- display names must drop control bytes.
          const name = (url.searchParams.get('name') || '未命名素材').replace(/[\u0000-\u001f]/g, '').slice(0, 240)
          const requestedType = url.searchParams.get('type') || ''
          const contentType = /^(?:audio|video)\/[a-z0-9.+-]+$/iu.test(requestedType) ? requestedType : probe.hasVideo ? 'video/mp4' : 'audio/mpeg'
          const entry = { id, name, ...probe, contentType, size, url: `/api/media/${id}`, ...(probe.hasAudio ? { audioUrl: `/api/media/${id}/audio` } : {}), createdAt: new Date().toISOString() }
          await rename(temporary, destination)
          await persist(join(mediaDir, `${id}.json`), entry)
          media.set(id, entry)
          return send(response, 201, entry)
        } catch (error) {
          await Promise.all([unlink(temporary).catch(() => {}), unlink(destination).catch(() => {})])
          throw error
        }
      }
      const mediaRoute = /^\/media\/([^/]+)(\/audio)?$/.exec(path)
      if (request.method === 'GET' && mediaRoute) {
        const source = findMedia(mediaRoute[1])
        if (!mediaRoute[2]) return await streamFile(request, response, join(mediaDir, `${source.id}.media`), source.contentType || (source.hasVideo ? 'video/mp4' : 'audio/mpeg'))
        if (!source.hasAudio) throw errorWithStatus('素材没有音轨，无法转写。', 422)
        const output = join(mediaDir, `${source.id}.wav`)
        try { await stat(output) } catch {
          if (!audioRequests.has(source.id)) {
            const operation = (async () => {
              const temporary = join(mediaDir, `${source.id}.${randomUUID()}.wav`)
              try {
                await runProcess('ffmpeg', ['-nostdin', '-v', 'error', '-n', '-i', join(mediaDir, `${source.id}.media`), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', temporary], { timeout: 1_800_000 })
                await rename(temporary, output)
              } finally { await unlink(temporary).catch(() => {}) }
            })()
            audioRequests.set(source.id, operation)
            operation.finally(() => audioRequests.delete(source.id)).catch(() => {})
          }
          await audioRequests.get(source.id)
        }
        return await streamFile(request, response, output, 'audio/wav')
      }
      if (request.method === 'POST' && path === '/session') {
        const { context } = await readJson(request)
        if (!context || typeof context !== 'object' || !validProjectId(context.projectId)) throw errorWithStatus('缺少有效的项目标识。')
        const source = findMedia(context.sourceId)
        const transcript = Array.isArray(context.transcript) && context.transcript.length ? validateTranscript(context.transcript, source.duration) : []
        const contextId = randomUUID()
        const savedContext = { projectId: context.projectId, sourceId: source.id, sourceMedia: source.name, duration: source.duration,
          contextId, transcript, hasActualTranscript: context.hasActualTranscript === true && transcript.length > 0,
          briefing: context.briefing && typeof context.briefing === 'object' ? context.briefing : {},
          targetScript: typeof context.targetScript === 'string' ? context.targetScript.slice(0, 250_000) : '' }
        return send(response, 200, await updateSession({ contextId, context: savedContext, reviewPlan: null, narrativePlan: null }))
      }
      if (request.method === 'POST' && (path === '/plan' || path === '/narrative-plan')) {
        const body = await readJson(request)
        const context = checkContext(body)
        if (path === '/narrative-plan') {
          if (body.narrativePlan?.reviewRequired !== true) throw errorWithStatus('只接受待复核的叙事计划。')
          return send(response, 200, await updateSession({ narrativePlan: validateNarrativePlan(body.narrativePlan, context) }))
        }
        return send(response, 200, await updateSession({ reviewPlan: validateReviewPlan(body.reviewPlan, context) }))
      }
      if (request.method === 'POST' && path === '/exports') {
        const body = await readJson(request)
        if (body.confirmed !== true) throw errorWithStatus('请先确认保留片段和成稿顺序。')
        if (!validProjectId(body.projectId)) throw errorWithStatus('缺少有效的项目标识。')
        if (body.contextId) checkContext(body)
        const source = findMedia(body.sourceId)
        if (!(await getHealth()).ffmpeg) throw errorWithStatus('请安装 FFmpeg 后重启服务。', 503)
        const segments = validateSegments(body.segments, source.duration)
        if ([...jobs.values()].filter((job) => ['running', 'queued'].includes(job.status)).length >= 5) throw errorWithStatus('已有 5 个导出任务，请等待完成后再试。', 429)
        const job = { id: randomUUID(), projectId: body.projectId, sourceId: source.id, status: 'queued', progress: 0, segments, createdAt: new Date().toISOString() }
        jobs.set(job.id, job)
        await saveJob(job)
        send(response, 202, { ...job })
        void processJobs()
        return
      }
      const exportRoute = /^\/exports\/([^/]+)(\/download)?$/.exec(path)
      if (request.method === 'GET' && exportRoute) {
        const job = ID.test(exportRoute[1]) ? jobs.get(exportRoute[1]) : undefined
        if (!job) throw errorWithStatus('导出任务不存在。', 404)
        if (!exportRoute[2]) return send(response, 200, job)
        if (job.status !== 'completed') throw errorWithStatus('导出尚未完成。', 409)
        return await streamFile(request, response, join(exportDir, `${job.id}.mp4`), 'video/mp4', `rfg-cut-${job.id.slice(0, 8)}.mp4`)
      }
      send(response, 404, { error: '未找到本机服务功能。' })
    } catch (error) { send(response, error.status ?? 400, { error: error.message || '本机处理失败。' }) }
  })
  server.requestTimeout = 30 * 60_000
  server.headersTimeout = 15_000
  return { server, async close() {
    closing = true
    for (const controller of controllers) controller.abort()
    if (server.listening) await new Promise((resolve) => { server.close(resolve); server.closeIdleConnections() })
    while (workerBusy) await new Promise((resolve) => setTimeout(resolve, 20))
    await Promise.allSettled([...audioRequests.values(), ...writes.values()])
  } }
}
