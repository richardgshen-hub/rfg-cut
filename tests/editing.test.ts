import test from 'node:test'
import assert from 'node:assert/strict'
import { makeEditedSrt, matchTargetScript, validateSegments } from '../src/editing.ts'
import { parseTimestampedTranscript } from '../src/script.ts'

const transcript = [
  { start: 0, end: 2, text: '先说第二件事。' },
  { start: 2.5, end: 4, text: '真正重要的是安全。' },
  { start: 4.5, end: 6, text: '最后欢迎来体验。' },
]

test('prepared script creates a reordered evidence-based sequence', () => {
  const result = matchTargetScript('最后欢迎来体验。\n真正重要的是安全。', transcript)
  assert.equal(result.segments.length, 2)
  assert.deepEqual(result.segments.map(({ start, end }) => [start, end]), [[4.5, 6], [2.5, 4]])
})

test('unmatched target prose remains unresolved', () => {
  const result = matchTargetScript('这是原片完全没有说过的话。', transcript)
  assert.equal(result.segments.length, 0)
  assert.equal(result.matches[0].status, 'missing')
})

test('edited SRT is retimed in output order', () => {
  const segments = matchTargetScript('最后欢迎来体验。\n真正重要的是安全。', transcript).segments
  const srt = makeEditedSrt(segments, transcript)
  assert.match(srt, /00:00:00,000 --> 00:00:01,500\n最后欢迎来体验。/u)
  assert.match(srt, /00:00:01,500 --> 00:00:03,000\n真正重要的是安全。/u)
})

test('overlapping ranges are rejected', () => {
  const errors = validateSegments([
    { id: 'a', start: 0, end: 2, text: 'a', reason: '', enabled: true, confirmed: true },
    { id: 'b', start: 1, end: 3, text: 'b', reason: '', enabled: true, confirmed: true },
  ], 5)
  assert.ok(errors.some(error => error.includes('重叠')))
})

test('SRT parser accepts cue blocks and rejects plain prose', () => {
  assert.equal(parseTimestampedTranscript('1\n00:00:00,000 --> 00:00:01,250\n你好\n').length, 1)
  assert.throws(() => parseTimestampedTranscript('这只是没有时间码的成稿'))
})
