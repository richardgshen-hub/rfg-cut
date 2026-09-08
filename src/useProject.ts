import { useEffect, useRef, useState } from 'react'
import { createProject, parseProject, type Project } from './project'

const storageKey = 'rfg-cut-workspace/v1'
type Workspace = { projects: Project[]; activeId: string }
function initialWorkspace(): Workspace {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (raw?.projects?.length) {
      const projects = raw.projects.map(parseProject) as Project[]
      return { projects, activeId: projects.some(p => p.id === raw.activeId) ? raw.activeId : projects[0].id }
    }
  } catch { /* A malformed draft must not prevent opening the app. */ }
  const project = createProject()
  return { projects: [project], activeId: project.id }
}

export function useProject() {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [saveState, setSaveState] = useState('正在恢复本机草稿')
  const history = useRef<{ past: Project[]; future: Project[] }>({ past: [], future: [] })
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false })
  const touchHistory = () => setHistoryAvailability({ canUndo: history.current.past.length > 0, canRedo: history.current.future.length > 0 })
  const project = workspace.projects.find(p => p.id === workspace.activeId) ?? workspace.projects[0]
  const projectRef = useRef(project)
  useEffect(() => { projectRef.current = project }, [project])

  useEffect(() => {
    const save = () => {
      try { localStorage.setItem(storageKey, JSON.stringify(workspace)); setSaveState('已保存到本机') }
      catch { setSaveState('浏览器存储已满，请下载项目备份') }
    }
    const timer = window.setTimeout(save, 300)
    window.addEventListener('pagehide', save)
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', save) }
  }, [workspace])

  const replace = (next: Project) => {
    const updated = { ...next, updatedAt: new Date().toISOString() }
    projectRef.current = updated
    setWorkspace(current => ({ ...current, projects: current.projects.map(p => p.id === updated.id ? updated : p) }))
    setSaveState('保存中…')
  }
  const update = (updater: (project: Project) => Project) => {
    const current = projectRef.current
    history.current = { past: [...history.current.past.slice(-49), current], future: [] }
    replace(updater(current))
    touchHistory()
  }
  const undo = () => {
    const next = history.current.past.pop()
    if (next) { history.current.future.push(projectRef.current); replace(next); touchHistory() }
  }
  const redo = () => {
    const next = history.current.future.pop()
    if (next) { history.current.past.push(projectRef.current); replace(next); touchHistory() }
  }
  const switchProject = (id: string) => {
    history.current = { past: [], future: [] }
    setWorkspace(current => ({ ...current, activeId: id }))
    touchHistory()
  }
  const addProject = (value?: Project) => {
    const next = value ? { ...value, id: crypto.randomUUID() } : createProject()
    history.current = { past: [], future: [] }
    setWorkspace(current => ({ projects: [...current.projects, next], activeId: next.id }))
    touchHistory()
  }
  return { project, projects: workspace.projects, update, undo, redo, ...historyAvailability, switchProject, addProject, saveState }
}
