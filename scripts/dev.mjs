#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vite = resolve(root, 'node_modules/vite/bin/vite.js')
const children = [
  spawn(process.execPath, [resolve(root, 'scripts/rfg-agent-bridge.mjs')], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [vite], { cwd: root, stdio: 'inherit' }),
]
let stopping = false
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  for (const child of children) if (!child.killed) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 500).unref()
}
for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`RFG Cut 子服务意外退出（${signal ?? code ?? '未知原因'}）。`)
      stop(code || 1)
    }
  })
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
