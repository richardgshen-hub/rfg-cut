import { spawn } from 'node:child_process'

export function runProcess(command, args, { timeout = 120_000, onStdout, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], signal })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
    child.stdout.on('data', (data) => {
      stdout = (stdout + data.toString()).slice(-1_000_000)
      onStdout?.(data.toString())
    })
    child.stderr.on('data', (data) => { stderr = (stderr + data.toString()).slice(-8_000) })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} 处理失败：${stderr.slice(-1200) || '进程中断或超过处理时限'}`))
    })
  })
}

export async function probeMedia(path) {
  const { stdout } = await runProcess('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path])
  const probe = JSON.parse(stdout)
  const video = probe.streams?.find((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1)
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio')
  const duration = Number(probe.format?.duration ?? video?.duration ?? audio?.duration)
  if ((!video && !audio) || !Number.isFinite(duration) || duration <= 0) throw new Error('这个文件没有可读取的音视频轨道或有效时长。')
  return { duration, hasVideo: Boolean(video), hasAudio: Boolean(audio), width: video?.width, height: video?.height, format: probe.format?.format_name ?? '' }
}

export function validateSegments(segments, duration) {
  if (!Array.isArray(segments) || !segments.length || segments.length > 300) throw new Error('请选择 1–300 个需要保留的片段。')
  let total = 0
  const validated = segments.map((segment, index) => {
    const { start, end } = segment ?? {}
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.04 || end > duration + 0.03) {
      throw new Error(`第 ${index + 1} 个片段超出素材范围或时间码无效。`)
    }
    total += end - start
    return { start, end: Math.min(end, duration) }
  })
  if (total > 21_600) throw new Error('单次导出不能超过 6 小时。')
  const chronological = [...validated].sort((left, right) => left.start - right.start)
  if (chronological.some((segment, index) => index > 0 && segment.start < chronological[index - 1].end - 0.001)) {
    throw new Error('片段包含重复或重叠的原片范围，请调整切点后再导出。')
  }
  return validated
}

export async function renderSegments(source, output, segments, media, { onProgress, signal } = {}) {
  const ranges = validateSegments(segments, media.duration)
  const duration = ranges.reduce((total, segment) => total + segment.end - segment.start, 0)
  const filters = ranges.flatMap(({ start, end }, index) => [
    ...(media.hasVideo ? [`[0:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,setsar=1[v${index}]`] : []),
    ...(media.hasAudio ? [`[0:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`] : []),
  ])
  const labels = ranges.map((_, index) => `${media.hasVideo ? `[v${index}]` : ''}${media.hasAudio ? `[a${index}]` : ''}`).join('')
  filters.push(`${labels}concat=n=${ranges.length}:v=${Number(media.hasVideo)}:a=${Number(media.hasAudio)}${media.hasVideo ? '[outv]' : ''}${media.hasAudio ? '[outa]' : ''}`)
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-n', '-i', source, '-filter_complex', filters.join(';'),
    ...(media.hasVideo ? ['-map', '[outv]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'] : []),
    ...(media.hasAudio ? ['-map', '[outa]', '-c:a', 'aac', '-b:a', '192k'] : []),
    '-movflags', '+faststart', '-progress', 'pipe:1', output]
  let pending = ''
  await runProcess('ffmpeg', args, { timeout: 7_200_000, signal, onStdout: (chunk) => {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('out_time_us=')) {
        const elapsed = Number(line.slice('out_time_us='.length)) / 1_000_000
        if (Number.isFinite(elapsed)) onProgress?.(Math.max(0, Math.min(0.99, elapsed / duration)))
      }
    }
  } })
  const rendered = await probeMedia(output)
  if (Math.abs(rendered.duration - duration) > Math.max(0.3, ranges.length * 0.05)) throw new Error('成片时长与剪辑计划不符，请重新检查素材。')
  return { ...rendered, segments: ranges }
}
