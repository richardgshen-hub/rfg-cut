import { useMemo, useState } from 'react'
import { createHandoffPack, downloadJson, type Briefing } from './handoff'
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
  const [panel, setPanel] = useState<'highlights' | 'transcript' | 'brief'>('highlights')
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
  const selectedCount = useMemo(() => suggestions.filter((item) => item.enabled).length, [suggestions])
  const timestamp = `00:${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`
  const toggle = (id: string) => { setSuggestions((items) => items.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item)); setSelected(id); setNotice('剪辑建议已更新') }
  const toggleCleanRule = (rule: keyof typeof cleanRules) => setCleanRules((rules) => ({ ...rules, [rule]: !rules[rule] }))
  const exportHandoff = () => {
    downloadJson('rfg-cut-jianying-handoff.json', createHandoffPack({ projectName: '筑乐园主理人访谈', sourceMedia: 'C1556.MP4', briefing, transcript: lines, candidates: suggestions, cleanRules }))
    setNotice('已下载剪映交接包，等待人工复核')
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark" />RFG <strong>Cut</strong></div>
      <div className="project-control"><span className="project-dot" />筑乐园主理人访谈 <span>· 草稿</span><Icon name="chevron" size={15} /></div>
      <div className="top-actions"><span className="save-state"><i />{notice}</span><ToolButton icon="undo" label="撤销" /><ToolButton icon="redo" label="重做" /><button className="export-button" type="button" onClick={exportHandoff}><Icon name="download" size={16} />交接包</button></div>
    </header>
    <section className="workspace">
      <aside className="left-sidebar">
        <nav className="sidebar-nav"><button className="nav-item active"><Icon name="film" />剪辑</button><button className="nav-item"><Icon name="folder" />媒体</button><button className="nav-item"><Icon name="captions" />字幕</button><button className="nav-item"><Icon name="sparkle" />模板</button></nav>
        <div className="media-section"><div className="section-title"><span>本项目</span><button type="button" aria-label="添加媒体"><Icon name="plus" size={15} /></button></div><button className="media-row selected"><span className="media-thumb warm" /><span><strong>C1556.MP4</strong><small>06:18 · 4K</small></span><Icon name="more" size={16} /></button><button className="media-row"><span className="media-thumb cool" /><span><strong>opening.mp3</strong><small>00:14 · 音乐</small></span></button></div>
        <div className="sidebar-bottom"><button className="nav-item"><Icon name="settings" />设置</button></div>
      </aside>
      <section className="editor">
        <div className="editor-toolbar"><span className="crumb">主时间线 <b>/</b> C1556.MP4</span><div className="format-switch">{['9:16', '16:9'].map((value) => <button key={value} className={aspect === value ? 'selected' : ''} type="button" onClick={() => setAspect(value)}>{value}</button>)}</div></div>
        <div className="preview-wrap"><div className={`video-preview ${aspect === '9:16' ? 'portrait' : 'landscape'}`}>
          <div className="placeholder-scene"><div className="window-light" /><div className="scene-caption"><span>视频占位预览</span><strong>筑乐园 · 主理人访谈</strong></div></div><div className="safe-frame"><span>竖版安全区</span></div>
          <button type="button" className="preview-play" onClick={() => setPlaying(!playing)} aria-label={playing ? '暂停' : '播放'}><Icon name={playing ? 'pause' : 'play'} size={24} /></button>
          <div className="preview-controls"><span>{timestamp}</span><span> / 00:06:18</span><div /><ToolButton icon="volume" label="音量" /><ToolButton icon="fullscreen" label="全屏" /></div>
        </div></div>
        <section className="timeline"><div className="timeline-head">{['00:00','00:30','01:00','01:30','02:00','02:30','03:00','03:30','04:00','04:30','05:00','05:30','06:00'].map((item) => <span key={item}>{item}</span>)}</div><div className="track-row"><em>V1</em><div className="track video-track"><div className="clip-block"><span>C1556.MP4</span></div><div className="selection-range" /></div></div><div className="track-row"><em>A1</em><div className="track audio-track"><div className="waveform" /></div></div><div className="track-row caption-row"><em>T</em><div className="track"><span className="caption-chip">所以这次展览的起点，是想给孩子一个可以慢下来的地方。</span></div></div><div className="playhead" style={{ left: `${Math.max(10, Math.min(90, time / 4.2))}%` }} /><input className="scrubber" aria-label="播放位置" type="range" min="0" max="378" value={time} onChange={(event) => setTime(Number(event.target.value))} /></section>
      </section>
      <aside className="right-sidebar"><div className="inspector-head"><div><h1>智能剪辑</h1><p>先理解内容意图，再给出可审阅的剪辑建议</p></div><ToolButton icon="more" label="更多选项" /></div><div className="inspector-tabs"><button className={panel === 'highlights' ? 'active' : ''} type="button" onClick={() => setPanel('highlights')}>高光 <span>{selectedCount}</span></button><button className={panel === 'transcript' ? 'active' : ''} type="button" onClick={() => setPanel('transcript')}>逐字稿</button><button className={panel === 'brief' ? 'active' : ''} type="button" onClick={() => setPanel('brief')}>Brief</button></div>
        {panel === 'highlights' ? <div className="suggestions"><p className="panel-intro"><Icon name="sparkle" size={15} />结合 brief、观点完整度、情绪变化和停顿节奏</p>{suggestions.map((item) => <article className={`suggestion ${selected === item.id ? 'focused' : ''}`} key={item.id}><button type="button" className={`check ${item.enabled ? 'checked' : ''}`} onClick={() => toggle(item.id)} aria-label="选择高光"><Icon name={item.enabled ? 'check' : 'plus'} size={14} /></button><button type="button" className="suggestion-copy" onClick={() => setSelected(item.id)}><div><span>{item.start} — {item.end}</span><time>{item.duration}</time></div><strong>{item.title}</strong><p>{item.note}</p></button></article>)}<button type="button" className="generate-button" onClick={() => setNotice(`已生成 ${selectedCount} 条待确认高光片段`)}><Icon name="scissors" size={16} />生成 {selectedCount} 条高光</button></div> : panel === 'transcript' ? <div className="transcript-list">{lines.map(([at, copy], index) => <button key={at} type="button" className={index > 4 ? 'highlighted' : ''} onClick={() => setTime(Number(at.slice(3)) + index * 6)}><time>{at}</time><span>{copy}{index === 3 && <i className="tag filler">口癖</i>}{index === 5 && <i className="tag breath">换气口</i>}</span></button>)}</div> : <div className="brief-form"><p>这份 brief 会影响高光排序和剪映交接包内容。</p>{([['goal', '本条视频目标'], ['audience', '目标受众'], ['keyMessage', '核心表达'], ['callToAction', '希望观众行动']] as const).map(([field, label]) => <label key={field}><span>{label}</span><textarea value={briefing[field]} onChange={(event) => setBriefing((current) => ({ ...current, [field]: event.target.value }))} /></label>)}<button type="button" className="generate-button" onClick={() => { setPanel('highlights'); setNotice('已用最新 Brief 重新排序建议') }}><Icon name="sparkle" size={16} />应用 Brief</button></div>}
        <div className="edit-assist"><div><span><Icon name="scissors" size={16} />智能清理</span><div className="clean-rules">{([['fillers', '口癖'], ['pauses', '停顿'], ['breaths', '换气口']] as const).map(([rule, label]) => <button key={rule} className={cleanRules[rule] ? 'on' : ''} type="button" onClick={() => toggleCleanRule(rule)}>{cleanRules[rule] && <Icon name="check" size={10} />}{label}</button>)}</div></div><button type="button" onClick={() => setNotice('已生成可复核的删除清单')}>查看清单 ›</button></div>
      </aside>
    </section>
  </main>
}

export default App
