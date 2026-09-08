import type { MediaSource } from './project'

export type ExportJob = { id: string; status: 'queued' | 'running' | 'completed' | 'failed'; progress: number; error?: string; url?: string }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers }, signal: init.signal ?? AbortSignal.timeout(15_000) })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error ?? `本机服务暂时不可用（${response.status}）`)
  return body as T
}

export function importMedia(file: File, progress: (value: number) => void, signal: AbortSignal): Promise<MediaSource> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `/api/media?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type)}`)
    request.setRequestHeader('content-type', 'application/octet-stream')
    request.timeout = 10 * 60_000
    request.upload.onprogress = (event) => { if (event.lengthComputable) progress(event.loaded / event.total) }
    const abort = () => request.abort()
    signal.addEventListener('abort', abort, { once: true })
    request.onloadend = () => signal.removeEventListener('abort', abort)
    request.onerror = () => reject(new Error('素材导入失败，请检查本机服务。'))
    request.onabort = () => reject(new Error('已取消导入。'))
    request.ontimeout = () => reject(new Error('导入超时，请尝试更小的素材。'))
    request.onload = () => {
      try {
        const data = JSON.parse(request.responseText)
        if (request.status < 200 || request.status >= 300) throw new Error(data.error ?? '素材导入失败')
        resolve(data)
      } catch (error) { reject(error) }
    }
    if (signal.aborted) reject(new Error('已取消导入。'))
    else request.send(file)
  })
}
