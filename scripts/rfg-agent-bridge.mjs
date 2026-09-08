#!/usr/bin/env node
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRfgServer } from './server/local-server.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.RFG_CUT_PORT ?? 8791)
const service = await createRfgServer({ dataDir: process.env.RFG_CUT_DATA_DIR ?? resolve(projectRoot, '.rfg-cut') })
service.server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `本机服务端口 ${port} 已被占用。请关闭旧的 RFG Cut 服务后重新启动。` : error.message)
  process.exitCode = 1
})
service.server.listen(port, '127.0.0.1', () => console.log(`RFG Cut 本机服务：http://127.0.0.1:${port}`))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await service.close(); process.exit(0) })
