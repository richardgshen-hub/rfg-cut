export type TranscriptLine = { start: number; end: number; text: string }

type WorkerMessage =
  | { type: 'progress'; progress: number; status: string }
  | { type: 'complete'; transcript: TranscriptLine[] }
  | { type: 'error'; message: string }

function toMono16k(buffer: AudioBuffer) {
  const targetRate = 16_000
  const source = buffer.numberOfChannels === 1
    ? buffer.getChannelData(0)
    : mixChannels(buffer)
  const outputLength = Math.ceil(source.length * targetRate / buffer.sampleRate)
  const output = new Float32Array(outputLength)
  const ratio = buffer.sampleRate / targetRate
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio
    const low = Math.floor(sourceIndex)
    const high = Math.min(low + 1, source.length - 1)
    output[index] = source[low] + (source[high] - source[low]) * (sourceIndex - low)
  }
  return output
}

function mixChannels(buffer: AudioBuffer) {
  const mono = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const input = buffer.getChannelData(channel)
    for (let index = 0; index < buffer.length; index += 1) mono[index] += input[index] / buffer.numberOfChannels
  }
  return mono
}

export async function decodeMediaFile(file: File) {
  const context = new AudioContext({ sampleRate: 16_000 })
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    if (decoded.duration > 30 * 60) throw new Error('第一版限制为 30 分钟以内的素材。')
    return toMono16k(decoded)
  } finally {
    await context.close()
  }
}

export function transcribeLocal(audio: Float32Array, onProgress: (progress: number, status: string) => void) {
  return new Promise<TranscriptLine[]>((resolve, reject) => {
    const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (data.type === 'progress') onProgress(data.progress, data.status)
      if (data.type === 'complete') { worker.terminate(); resolve(data.transcript) }
      if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)) }
    }
    worker.onerror = () => { worker.terminate(); reject(new Error('本地转写工作线程异常退出。')) }
    worker.postMessage({ type: 'transcribe', audio }, [audio.buffer])
  })
}

export function formatTime(seconds: number, withMilliseconds = false) {
  const millis = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(millis / 3_600_000)
  const minutes = Math.floor((millis % 3_600_000) / 60_000)
  const secs = Math.floor((millis % 60_000) / 1_000)
  const tail = millis % 1_000
  const base = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return withMilliseconds ? `${base},${String(tail).padStart(3, '0')}` : base
}

export function transcriptToSrt(lines: TranscriptLine[]) {
  return lines.map((line, index) => `${index + 1}\n${formatTime(line.start, true)} --> ${formatTime(line.end, true)}\n${line.text.trim()}\n`).join('\n')
}

export function findCleanupCandidates(lines: TranscriptLine[]) {
  const filler = /(^|[，。！？、\s])(嗯+|呃+|额+|啊+|这个|就是|然后|其实)(?=[，。！？、\s]|$)/g
  return lines.flatMap((line, index) => {
    const candidates = [] as { type: '口癖' | '停顿' | '换气口'; start: number; end: number; note: string }[]
    if (filler.test(line.text)) candidates.push({ type: '口癖', start: line.start, end: line.end, note: '识别到常见口头填充词，删除前请复核语义。' })
    filler.lastIndex = 0
    const gap = index < lines.length - 1 ? lines[index + 1].start - line.end : 0
    if (gap >= 0.75) candidates.push({ type: '停顿', start: line.end, end: lines[index + 1].start, note: '静音间隔超过 0.75 秒，建议检查是否可压缩。' })
    if (gap >= 0.2 && gap < 0.75) candidates.push({ type: '换气口', start: line.end, end: lines[index + 1].start, note: '短暂停顿可能是换气口，默认保留。' })
    return candidates
  })
}
