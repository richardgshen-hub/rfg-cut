import { useMemo, useState } from 'react'
import { createHandoffPack, downloadJson, downloadText, type Briefing } from './handoff'
import { decodeMediaFile, findCleanupCandidates, formatTime, transcriptToSrt, transcribeLocal, type TranscriptLine } from './transcription'
import './App.css'

type IconName = 'film' | 'folder' | 'captions' | 'sparkle' | 'settings' | 'play' | 'pause' | 'volume' | 'fullscreen' | 'undo' | 'redo' | 'download' | 'check' | 'scissors' | 'plus' | 'chevron' | 'more'

type Suggestion = { id: string; title: string; start: string; end: string; duration: string; note: string; enabled: boolean }

const initialSuggestions: Suggestion[] = [
  { id: 'opening', title: '主理人：为什么要做这个展览', start: '00:42', end: '01:18', duration: '0:36', note: '观点完整，开场有明确问题', enabled: true },
  { id: 'moment', title: '孩子第一次走进展厅的反应', start: '02:06', end: '02:51', duration: '0:45', note: '情绪变化清晰，适合竖版', enabled: true },
  { id: 'closing', title: '给家长的一句话', start: '05:34', end: '06:02', duration: '0:28', note: '可作为收尾或独立短片', enabled: false },
]

const lines = [
  ['00:00', '我觉得很多家长会问，孩子这么小，真的看得懂展览吗？'],
  ['00:07', '其实我们并不急着让他看懂。'],
  ['00:12', '先让他在一个有颜色、有材料、有问题的空间里面待一会儿。'],
  ['00:23', '嗯，然后他会有自己的感受。'],
  ['00:32', '这对我们来说，比先得到一个标准答案重要得多。'],
  ['00:42', '所以这次展览的起点，是想给孩子一个可以慢下来的地方。'],
  ['00:51', '不是上课，也不是把知识塞给他。'],
  ['01:02', '而是邀请他去看，去碰，去问。'],
]

const demoTranscript: TranscriptLine[] = lines.map(([at, text], index) => {
  const [minutes, seconds] = at.split(':').map(Number)
  const start = minutes * 60 + seconds
  return { start, end: start + (index < lines.length - 1 ? 5.5 : 6), text }
})

function createHighlights(transcript: TranscriptLine[]): Suggestion[] {
  if (!transcript.length) return []
  const size = Math.max(1, Math.ceil(transcript.length / 3))
  return Array.from({ length: Math.min(3, Math.ceil(transcript.length / size)) }, (_, index) => {
    const group = transcript.slice(index * size, (index + 1) * size)
    const first = group[0]
    const last = group[group.length - 1]
    const duration = Math.max(1, Math.round(last.end - first.start))
    return { id: `generated-${index}`, title: first.text.slice(0, 28), start: formatTime(first.start).slice(3), end: formatTime(last.end).slice(3), duration: `0:${String(duration).padStart(2, '0')}`, note: '由真实逐字稿分段生成，请确认叙事完整度。', enabled: index < 2 }
  })
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const icons = {
    film: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
    folder: <><path d="M3 6.5h6l1.8 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z" /><path d="M3 10h18" /></>,
    captions: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h4M7 14h7M15 10h2M16 14h1" /></>,
    sparkle: <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Zm6.2 13.2.8 2.6 2.6.8-2.6.8-.8 2.6-.8-2.6-2.6-.8 2.6-.8.8-2.6Z" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20.3h-3v-.1A1.7 1.7 0 0 0 10.7 18.6a1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.06 15a1.7 1.7 0 0 0-1.56-1.03h-.1v-3h.1A1.7 1.7 0 0 0 7.06 9.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56v-.1h3v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.1v3h-.1A1.7 1.7 0 0 0 19.4 15Z" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />, pause: <path d="M8 5v14M16 5v14" strokeWidth="2.5" />,
    volume: <><path d="M5 10v4h3l4 3V7l-4 3H5Z" /><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" /></>,
    fullscreen: <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />, undo: <path d="M9 7 5 11l4 4M5 11h9a5 5 0 0 1 5 5" />, redo: <path d="m15 7 4 4-4 4m4-4h-9a5 5 0 0 0-5 5" />,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></>, check: <path d="m5 12 4 4L19 6" strokeWidth="2.4" />, scissors: <><circle cx="6" cy="7" r="2.5" /><circle cx="6" cy="17" r="2.5" /><path d="m8.2 8.2 10 7.2M8.2 15.8l10-7.2" /></>,
    plus: <path d="M12 5v14M5 12h14" />, chevron: <path d="m8 10 4 4 4-4" />, more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>
}

function ToolButton({ icon, label, onClick }: { icon: IconName; label: string; onClick?: () => void }) {
  return <button className="tool-button" type="button" onClick={onClick} aria-label={label} title={label}><Icon name={icon} /></button>
}

function App() {
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(42)
  const [panel, setPanel] = useState<'highlights' | 'transcript' | 'brief' | 'review'>('highlights')
  const [aspect, setAspect] = useState('9:16')
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [notice, setNotice] = useState('已自动保存到本机')
  const [selected, setSelected] = useState('opening')
  const [briefing, setBriefing] = useState<Briefing>({
    goal: '把主理人的教育理念剪成 3 条有完整观点的短视频。',
    audience: '关注儿童美育的家长与教育工作者。',
    keyMessage: '让孩子先感受、提问和停留，而不是急着得到标准答案。',
    callToAction: '保存并转发给正在为孩子找展览的朋友。',
  })
  const [cleanRules, setCleanRules] = useState({ fillers: true, pauses: true, breaths: false })
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>(demoTranscript)
  const [hasActualTranscript, setHasActualTranscript] = useState(false)
  const [asrStatus, setAsrStatus] = useState<{ progress: number; message: string; running: boolean }>({ progress: 0, message: '等待导入素材', running: false })
  const selectedCount = useMemo(() => suggestions.filter((item) => item.enabled).length, [suggestions])
  const cleanupCandidates = useMemo(() => findCleanupCandidates(transcriptLines), [transcriptLines])
  const workflowStep = hasActualTranscript ? 4 : sourceFile ? 3 : 1
  const timestamp = `00:${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`
  const toggle = (id: string) => { setSuggestions((items) => items.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item)); setSelected(id); setNotice('剪辑建议已更新') }
  const toggleCleanRule = (rule: keyof typeof cleanRules) => setCleanRules((rules) => ({ ...rules, [rule]: !rules[rule] }))
  const exportHandoff = () => {
    if (!hasActualTranscript) { setNotice('请先完成真实素材转写，再导出交接包'); return }
    downloadJson('rfg-cut-jianying-handoff.json', createHandoffPack({ projectName: '筑乐园主理人访谈', sourceMedia: sourceFile?.name ?? 'C1556.MP4', briefing, transcript: transcriptLines, candidates: suggestions, cleanRules, cleanupCandidates }))
    setNotice('已下载剪映交接包，等待人工复核')
  }
  const runTranscription = async () => {
    if (!sourceFile) { setNotice('请先导入一个视频或音频文件'); return }
    setAsrStatus({ progress: 0, message: '正在从本地素材解码音频', running: true })
    try {
      const audio = await decodeMediaFile(sourceFile)
      const result = await transcribeLocal(audio, (progress, message) => setAsrStatus({ progress, message, running: true }))
      if (!result.length) throw new Error('没有识别到可用语音，请换一段更清晰的素材。')
      setTranscriptLines(result)
      setSuggestions(createHighlights(result))
      setHasActualTranscript(true)
      setAsrStatus({ progress: 1, message: `完成：${result.length} 个带时间码的片段`, running: false })
      setPanel('review')
      setNotice('真实逐字稿已生成：请先复核清理建议')
    } catch (error) {
      setAsrStatus({ progress: 0, message: error instanceof Error ? error.message : '本地转写失败', running: false })
      setNotice('转写没有完成，请查看状态说明')
    }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark" />RFG <strong>Cut</strong></div>
      <div className="project-control"><span className="project-dot" />筑乐园主理人访谈 <span>· 草稿</span><Icon name="chevron" size={15} /></div>
      <div className="top-actions"><span className="save-state" aria-live="polite"><i />{notice}</span><a className="motion-preview-link" href="/demo/rfg-cut-export-preview.mp4" target="_blank" rel="noreferrer">交付预演</a><ToolButton icon="undo" label="撤销" /><ToolButton icon="redo" label="重做" /><button className="export-button" type="button" disabled={!hasActualTranscript} title={hasActualTranscript ? '下载剪映交接包' : '请先完成真实素材转写'} onClick={exportHandoff}><Icon name="download" size={16} />交接包</button></div>
    </header>
    <section className="workspace">
      <aside className="left-sidebar">
        <nav className="sidebar-nav"><button className="nav-item active"><Icon name="film" />剪辑</button><button className="nav-item"><Icon name="folder" />媒体</button><button className="nav-item"><Icon name="captions" />字幕</button><button className="nav-item"><Icon name="sparkle" />模板</button></nav>
        <ol className="workflow" aria-label="剪辑工作流程">{['导入素材', '填写 Brief', '本地转写', '复核并交接'].map((label, index) => <li key={label} className={workflowStep > index + 1 ? 'done' : workflowStep === index + 1 ? 'current' : ''}><span>{workflowStep > index + 1 ? <Icon name="check" size={11} /> : index + 1}</span>{label}</li>)}</ol>
        <div className="media-section"><div className="section-title"><span>本项目</span><label className="media-add" title="导入媒体"><Icon name="plus" size={15} /><input id="source-media" type="file" accept="video/*,audio/*" onChange={(event) => { const file = event.target.files?.[0] ?? null; setSourceFile(file); setHasActualTranscript(false); if (file) { setAsrStatus({ progress: 0, message: `已选择 ${file.name}`, running: false }); setNotice('素材仅在本机处理，尚未上传') } }} /></label></div><button className="media-row selected"><span className="media-thumb warm" /><span><strong>{sourceFile?.name ?? '请选择你的素材'}</strong><small>{sourceFile ? `${(sourceFile.size / 1_048_576).toFixed(1)} MB · 本地文件` : '尚未导入 · 演示内容不会导出'}</small></span><Icon name="more" size={16} /></button>{sourceFile && <button className="transcribe-button" type="button" disabled={asrStatus.running} onClick={runTranscription}><Icon name="sparkle" size={15} />{asrStatus.running ? '正在本机转写…' : '转写本地素材'}</button>}<div className="asr-state"><span style={{ width: `${Math.round(asrStatus.progress * 100)}%` }} /><p>{asrStatus.message}</p></div></div>
        <div className="sidebar-bottom"><button className="nav-item"><Icon name="settings" />设置</button></div>
      </aside>
      <section className="editor">
        <div className="editor-toolbar"><span className="crumb">主时间线 <b>/</b> C1556.MP4</span><div className="format-switch">{['9:16', '16:9'].map((value) => <button key={value} className={aspect === value ? 'selected' : ''} type="button" onClick={() => setAspect(value)}>{value}</button>)}</div></div>
        <div className="preview-wrap">{!sourceFile && <label className="import-empty" htmlFor="source-media"><Icon name="plus" size={20} /><strong>从一段口播开始</strong><span>导入视频或音频；素材只在本机处理</span><b>选择素材</b></label>}<div className={`video-preview ${aspect === '9:16' ? 'portrait' : 'landscape'} ${sourceFile ? '' : 'demo-preview'}`}>
          <div className="placeholder-scene"><div className="window-light" /><div className="scene-caption"><span>视频占位预览</span><strong>筑乐园 · 主理人访谈</strong></div></div><div className="safe-frame"><span>竖版安全区</span></div>
          <button type="button" className="preview-play" onClick={() => setPlaying(!playing)} aria-label={playing ? '暂停' : '播放'}><Icon name={playing ? 'pause' : 'play'} size={24} /></button>
          <div className="preview-controls"><span>{timestamp}</span><span> / 00:06:18</span><div /><ToolButton icon="volume" label="音量" /><ToolButton icon="fullscreen" label="全屏" /></div>
        </div></div>
        <section className="timeline"><div className="timeline-head">{['00:00','00:30','01:00','01:30','02:00','02:30','03:00','03:30','04:00','04:30','05:00','05:30','06:00'].map((item) => <span key={item}>{item}</span>)}</div><div className="track-row"><em>V1</em><div className="track video-track"><div className="clip-block"><span>C1556.MP4</span></div><div className="selection-range" /></div></div><div className="track-row"><em>A1</em><div className="track audio-track"><div className="waveform" /></div></div><div className="track-row caption-row"><em>T</em><div className="track"><span className="caption-chip">所以这次展览的起点，是想给孩子一个可以慢下来的地方。</span></div></div><div className="playhead" style={{ left: `${Math.max(10, Math.min(90, time / 4.2))}%` }} /><input className="scrubber" aria-label="播放位置" type="range" min="0" max="378" value={time} onChange={(event) => setTime(Number(event.target.value))} /></section>
      </section>
      <aside className="right-sidebar"><div className="inspector-head"><div><h1>智能剪辑</h1><p>先理解内容意图，再给出可审阅的剪辑建议</p></div><ToolButton icon="more" label="更多选项" /></div><div className="inspector-tabs"><button className={panel === 'highlights' ? 'active' : ''} type="button" onClick={() => setPanel('highlights')}>高光 <span>{selectedCount}</span></button><button className={panel === 'transcript' ? 'active' : ''} type="button" onClick={() => setPanel('transcript')}>逐字稿</button><button className={panel === 'review' ? 'active' : ''} type="button" onClick={() => setPanel('review')}>复核</button><button className={panel === 'brief' ? 'active' : ''} type="button" onClick={() => setPanel('brief')}>Brief</button></div>
        {panel === 'highlights' ? <div className="suggestions"><p className="panel-intro"><Icon name="sparkle" size={15} />结合 brief、观点完整度、情绪变化和停顿节奏</p>{suggestions.map((item) => <article className={`suggestion ${selected === item.id ? 'focused' : ''}`} key={item.id}><button type="button" className={`check ${item.enabled ? 'checked' : ''}`} onClick={() => toggle(item.id)} aria-label="选择高光"><Icon name={item.enabled ? 'check' : 'plus'} size={14} /></button><button type="button" className="suggestion-copy" onClick={() => setSelected(item.id)}><div><span>{item.start} — {item.end}</span><time>{item.duration}</time></div><strong>{item.title}</strong><p>{item.note}</p></button></article>)}<button type="button" className="generate-button" onClick={() => setNotice(`已生成 ${selectedCount} 条待确认高光片段`)}><Icon name="scissors" size={16} />生成 {selectedCount} 条高光</button></div> : panel === 'transcript' ? <div className="transcript-list"><div className="transcript-actions"><span>{transcriptLines.length} 段 · {cleanupCandidates.length} 个清理候选</span><button type="button" disabled={!hasActualTranscript} onClick={() => { downloadText('rfg-cut-transcript.srt', transcriptToSrt(transcriptLines), 'application/x-subrip;charset=utf-8'); setNotice('已下载真实转写的 SRT 字幕') }}>导出 SRT</button></div>{transcriptLines.map((line) => <button key={`${line.start}-${line.text}`} type="button" className={line.start >= 42 ? 'highlighted' : ''} onClick={() => setTime(Math.floor(line.start))}><time>{formatTime(line.start).slice(3)}</time><span>{line.text}{findCleanupCandidates([line]).some((item) => item.type === '口癖') && <i className="tag filler">口癖</i>}</span></button>)}</div> : panel === 'review' ? <div className="review-list"><p className="panel-intro"><Icon name="scissors" size={15} />这是建议清单，不会自动删除原片内容。</p>{hasActualTranscript ? cleanupCandidates.length ? cleanupCandidates.map((candidate, index) => <article className="review-row" key={`${candidate.type}-${candidate.start}-${index}`}><span className={`tag ${candidate.type === '口癖' ? 'filler' : candidate.type === '换气口' ? 'breath' : 'pause'}`}>{candidate.type}</span><div><strong>{formatTime(candidate.start).slice(3)} — {formatTime(candidate.end).slice(3)}</strong><p>{candidate.note}</p></div></article>) : <div className="empty-message">没有发现需要优先复核的候选。</div> : <div className="empty-message">完成真实转写后，这里会列出可逐条复核的口癖、停顿和换气候选。</div>}</div> : <div className="brief-form"><p>这份 brief 会影响高光排序和剪映交接包内容。</p>{([['goal', '本条视频目标'], ['audience', '目标受众'], ['keyMessage', '核心表达'], ['callToAction', '希望观众行动']] as const).map(([field, label]) => <label key={field}><span>{label}</span><textarea value={briefing[field]} onChange={(event) => setBriefing((current) => ({ ...current, [field]: event.target.value }))} /></label>)}<button type="button" className="generate-button" onClick={() => { setPanel('highlights'); setNotice('已用最新 Brief 重新排序建议') }}><Icon name="sparkle" size={16} />应用 Brief</button></div>}
        <div className="edit-assist"><div><span><Icon name="scissors" size={16} />智能清理 · {cleanupCandidates.length} 个候选</span><div className="clean-rules">{([['fillers', '口癖'], ['pauses', '停顿'], ['breaths', '换气口']] as const).map(([rule, label]) => <button key={rule} className={cleanRules[rule] ? 'on' : ''} type="button" onClick={() => toggleCleanRule(rule)}>{cleanRules[rule] && <Icon name="check" size={10} />}{label}</button>)}</div></div><button type="button" onClick={() => { setPanel('review'); setNotice('请逐条复核后再交给剪映处理') }}>查看清单 ›</button></div>
      </aside>
    </section>
  </main>
}

export default App
