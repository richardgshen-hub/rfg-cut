import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRfgServer } from '../scripts/server/local-server.mjs'
import { runProcess } from '../plugins/rfg-cut-agent/scripts/media-engine.mjs'

test('local server imports, streams and renders a real reordered MP4', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rfg-cut-test-'))
  const fixture = join(directory, 'fixture.mp4')
  const service = await createRfgServer({ dataDir: join(directory, 'data'), maxUploadBytes: 30_000_000 })
  try {
    await runProcess('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fixture])
    await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve))
    const address = service.server.address()
    if (!address || typeof address === 'string') throw new Error('测试服务没有获得端口。')
    const base = `http://127.0.0.1:${address.port}/api`
    const upload = await fetch(`${base}/media?name=fixture.mp4&type=video%2Fmp4`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: await readFile(fixture), duplex: 'half' })
    assert.equal(upload.status, 201)
    const source = await upload.json()
    assert.equal(source.hasVideo, true)
    assert.equal(source.hasAudio, true)

    const sessionResponse = await fetch(`${base}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ context: { projectId: 'test-project', sourceId: source.id, hasActualTranscript: true, transcript: [{ start: 0, end: 1, text: '第一句原话。' }, { start: 2, end: 3, text: '第二句原话。' }], briefing: { goal: '测试' }, targetScript: '第二句原话。' } }) })
    assert.equal(sessionResponse.status, 200)
    const session = await sessionResponse.json()
    const stalePlan = await fetch(`${base}/narrative-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contextId: 'stale-context', projectId: 'test-project', sourceId: source.id, narrativePlan: { reviewRequired: true } }) })
    assert.equal(stalePlan.status, 409)
    const validPlan = await fetch(`${base}/narrative-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contextId: session.contextId, projectId: 'test-project', sourceId: source.id, narrativePlan: { title: '测试剪法', summary: '把结论放在前面。', reviewRequired: true, beats: [{ start: 2, end: 3, sourceText: '第二句原话。', role: '开场', editReason: '先给结论' }], warnings: [] } }) })
    assert.equal(validPlan.status, 200)
    assert.equal((await validPlan.json()).narrativePlan.beats[0].sourceText, '第二句原话。')

    const partial = await fetch(`${base}/media/${source.id}`, { headers: { range: 'bytes=0-63' } })
    assert.equal(partial.status, 206)
    assert.equal((await partial.arrayBuffer()).byteLength, 64)

    const started = await fetch(`${base}/exports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'test-project', sourceId: source.id, confirmed: true, segments: [{ start: 2, end: 3 }, { start: 0, end: 1 }] }) })
    assert.equal(started.status, 202)
    let job = await started.json()
    for (let attempt = 0; attempt < 80 && !['completed', 'failed'].includes(job.status); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
      job = await (await fetch(`${base}/exports/${job.id}`)).json()
    }
    assert.equal(job.status, 'completed', job.error)
    assert.ok(Math.abs(job.duration - 2) < 0.25)
    const download = await fetch(`http://127.0.0.1:${address.port}${job.url}`)
    assert.equal(download.status, 200)
    assert.ok((await download.arrayBuffer()).byteLength > 1_000)

    const rejectedOrigin = await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } })
    assert.equal(rejectedOrigin.status, 403)
  } finally {
    await service.close()
    await rm(directory, { recursive: true, force: true })
  }
})
