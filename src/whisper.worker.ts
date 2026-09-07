import { pipeline } from '@huggingface/transformers'

type WhisperChunk = { text: string; timestamp: [number, number] }
type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ chunks?: WhisperChunk[]; text: string }>
let transcriber: Transcriber | null = null

self.onmessage = async ({ data }: MessageEvent<{ type: 'transcribe'; audio: Float32Array }>) => {
  if (data.type !== 'transcribe') return
  try {
    if (!transcriber) {
      self.postMessage({ type: 'progress', progress: 0, status: '正在下载本地 Whisper 模型（首次使用）' })
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        progress_callback: (event: { progress?: number; status?: string }) => self.postMessage({ type: 'progress', progress: event.progress ?? 0, status: event.status ?? '正在准备模型' }),
      }) as unknown as Transcriber
    }
    self.postMessage({ type: 'progress', progress: 1, status: '正在本机转写音频' })
    const result = await transcriber(data.audio, { language: 'chinese', task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 })
    const transcript = (result.chunks ?? []).map((chunk) => ({ start: chunk.timestamp[0], end: chunk.timestamp[1], text: chunk.text.trim() })).filter((chunk) => chunk.text)
    self.postMessage({ type: 'complete', transcript })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Whisper 转写失败。' })
  }
}
