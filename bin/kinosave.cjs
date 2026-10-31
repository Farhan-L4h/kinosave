#!/usr/bin/env node

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const startScript = path.join(projectRoot, 'scripts', 'start-server.ps1')
const command = process.argv[2]?.toLowerCase()

if (command !== 'start') {
  console.log('Usage: kinosave start')
  process.exit(command ? 1 : 0)
}

const result = spawnSync('powershell.exe', [
  '-NoLogo',
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  startScript,
], { cwd: projectRoot, stdio: 'inherit' })

if (result.error) {
  console.error(`KinoSave gagal dijalankan: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
