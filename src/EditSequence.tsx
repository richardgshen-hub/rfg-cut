import type { EditSegment } from './project'
import { formatTime } from './transcription'

type Props = { segments: EditSegment[]; onChange: (segments: EditSegment[]) => void; onPlay: (start: number, end: number) => void }
export function EditSequence({ segments, onChange, onPlay }: Props) {
  const patch = (id: string, values: Partial<EditSegment>) => onChange(segments.map(s => s.id === id ? { ...s, ...values, confirmed: false } : s))
  const move = (index: number, delta: number) => {
    const next = [...segments]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    onChange(next.map(s => ({ ...s, confirmed: false })))
  }
  if (!segments.length) return <div className="empty-state"><h3>还没有剪辑片段</h3><p>先导入逐字稿，再按目标稿匹配，或把想保留的原话加入成片。</p></div>
  return <ol className="edit-list">{segments.map((segment, index) => <li key={segment.id} className={segment.enabled ? 'edit-row' : 'edit-row excluded'}>
    <div className="edit-row-head"><label><input type="checkbox" checked={segment.enabled} onChange={e => patch(segment.id, { enabled: e.target.checked })} aria-label={`保留片段 ${index + 1}`} /><span>{String(index + 1).padStart(2, '0')}</span></label><span className="state-label">{segment.confirmed ? '已确认' : '待复核'}</span><button type="button" className="quiet" onClick={() => onPlay(segment.start, segment.end)}>试听</button></div>
    <p className="source-quote">{segment.text}</p><p className="muted reason">{segment.reason}</p>
    <div className="range-fields"><label>入点 / 秒<input aria-label={`片段 ${index + 1} 入点`} type="number" min="0" step="0.01" value={segment.start} onChange={e => patch(segment.id, { start: Number(e.target.value) })} /></label><label>出点 / 秒<input aria-label={`片段 ${index + 1} 出点`} type="number" min="0" step="0.01" value={segment.end} onChange={e => patch(segment.id, { end: Number(e.target.value) })} /></label><div className="move-actions"><button type="button" aria-label={`上移片段 ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`下移片段 ${index + 1}`} disabled={index === segments.length - 1} onClick={() => move(index, 1)}>↓</button></div></div>
    <small className="muted">原片 {formatTime(segment.start, true)} → {formatTime(segment.end, true)}</small>
  </li>)}</ol>
}
