'use strict'

const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')

const REQUIRED_BINARIES = ['yt-dlp', 'ffmpeg', 'cloudflared']
const SERVER_READY_TIMEOUT_MS = 30_000
const TUNNEL_READY_TIMEOUT_MS = 45_000
const BINARY_FALLBACK_PATHS = {
  'yt-dlp': [
    'C:\\ProgramData\\chocolatey\\bin\\yt-dlp.exe',
    'C:\\ffmpeg\\bin\\yt-dlp.exe',
    'C:\\Program Files\\yt-dlp\\yt-dlp.exe',
  ],
  ffmpeg: [
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  ],
  cloudflared: [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ],
}

function which(command) {
  const result = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) return null
  const line = (result.stdout || '').split(/\r?\n/).map((value) => value.trim()).find(Boolean)
  return line || null
}

function resolveBinary(command) {
  const found = which(command)
  if (found) return found
  for (const candidate of BINARY_FALLBACK_PATHS[command] || []) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function readKeyFromEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = /^MEDIA_PROVIDER_API_KEY=(.*)$/.exec(line.trim())
    if (!match) continue
    const value = match[1].trim().replace(/^["']|["']$/g, '')
    if (value) return value
  }
  return null
}

function readApiKey({ env, resourceRoot, workDir, config }) {
  const inline = env.KINOSAVE_API_KEY?.trim()
  if (inline) return inline

  const candidates = [
    path.join(workDir, 'provider-key.txt'),
    path.join(os.tmpdir(), 'kinosave-provider-key.txt'),
    path.join(resourceRoot, '.env.production.local'),
    path.join(resourceRoot, '.env.local'),
    ...(config.apiKeyEnvFiles || []),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    if (candidate.endsWith('.txt')) {
      if (!fs.existsSync(candidate)) continue
      const value = fs.readFileSync(candidate, 'utf8').trim()
      if (value) return value
      continue
    }
    const value = readKeyFromEnvFile(candidate)
    if (value) return value
  }

  return null
}

function writeTunnelConfig(config) {
  const tunnelConfig = [
    `tunnel: ${config.tunnelId}`,
    `credentials-file: ${path.join(os.homedir(), '.cloudflared', `${config.tunnelId}.json`)}`,
    'ingress:',
    `  - hostname: ${config.hostname}`,
    `    service: http://127.0.0.1:${config.servicePort}`,
    '  - service: http_status:404',
    '',
  ].join('\n')
  const target = path.join(os.tmpdir(), 'kinosave-api-tunnel.yml')
  fs.writeFileSync(target, tunnelConfig, 'utf8')
  return target
}

function killProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    return
  }
  try {
    child.kill('SIGKILL')
  } catch {
    // process already gone
  }
}

function probeServer(port) {
  return new Promise((resolve) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: '/', method: 'GET', timeout: 2_000 },
      (response) => {
        response.resume()
        resolve(true)
      },
    )
    request.on('error', () => resolve(false))
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
    request.end()
  })
}

function requestJson(url, body, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const target = new URL(url)
    const transport = target.protocol === 'https:' ? https : http
    const request = transport.request(
      target,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: timeoutMs,
      },
      (response) => {
        let raw = ''
        response.on('data', (chunk) => { raw += chunk })
        response.on('end', () => resolve({ status: response.statusCode, body: raw }))
      },
    )
    request.on('error', reject)
    request.on('timeout', () => {
      request.destroy(new Error('Waktu habis.'))
    })
    request.end(payload)
  })
}

async function waitForServer(port, child) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false
    if (await probeServer(port)) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

async function waitForTunnel(child, output) {
  const deadline = Date.now() + TUNNEL_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false
    if (output.some((line) => line.includes('Registered tunnel connection'))) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

class ServiceManager {
  constructor({ resourceRoot, workDir, config, log, onStatus }) {
    this.resourceRoot = resourceRoot
    this.workDir = workDir
    this.config = config
    this.log = log || (() => {})
    this.onStatus = onStatus || (() => {})
    this.server = null
    this.tunnel = null
    this.lastExit = null
    this.status = { server: 'stopped', tunnel: 'stopped', error: null }
    this.emit()
  }

  emit() {
    this.onStatus({ ...this.status })
  }

  setStatus(part, value, error) {
    this.status = { ...this.status, [part]: value, error: error ?? null }
    this.emit()
  }

  capture(child, label, part) {
    const stderrTail = []
    const push = (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line.trim()) continue
        this.log(`${label}: ${line.trim()}`)
        stderrTail.push(line.trim())
        if (stderrTail.length > 6) stderrTail.shift()
      }
    }
    child.stdout?.on('data', push)
    child.stderr?.on('data', push)
    child.on('exit', (code) => {
      this.log(`${label}: proses berhenti (kode ${code})`)
      this.lastExit = { part, code, detail: stderrTail.join(' | ') }
      if (this.status[part] !== 'stopped') {
        this.setStatus(part, 'error', `${label} berhenti sendiri (kode ${code}).`)
      }
    })
  }

  missingBinaries() {
    return REQUIRED_BINARIES.filter((binary) => !resolveBinary(binary))
  }

  async start() {
    if (this.server || this.tunnel) return this.status
    if (this.startPromise) return this.startPromise
    this.startPromise = this.startServices().finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  async startServices() {
    if (this.server || this.tunnel) return this.status

    const missing = this.missingBinaries()
    if (missing.length) {
      const message = `Program belum terpasang: ${missing.join(', ')}. Pasang yt-dlp, ffmpeg, dan cloudflared lalu coba lagi.`
      this.setStatus('server', 'error', message)
      throw new Error(message)
    }

    const apiKey = readApiKey({
      env: process.env,
      resourceRoot: this.resourceRoot,
      workDir: this.workDir,
      config: this.config,
    })
    const keyHashes = (this.config.apiKeyHashes || []).filter(Boolean)
    if (!apiKey && !keyHashes.length) {
      const message = 'API key tidak ditemukan. Isi MEDIA_PROVIDER_API_KEY di .env.local atau set KINOSAVE_API_KEY.'
      this.setStatus('server', 'error', message)
      throw new Error(message)
    }
    const credentials = path.join(os.homedir(), '.cloudflared', `${this.config.tunnelId}.json`)
    if (!fs.existsSync(credentials)) {
      const message = `Kredensial tunnel tidak ditemukan: ${credentials}`
      this.setStatus('server', 'error', message)
      throw new Error(message)
    }

    const serverPath = path.join(this.resourceRoot, 'deploy', 'ytdlp', 'server.mjs')
    if (!fs.existsSync(serverPath)) {
      const message = `Server downloader tidak ditemukan: ${serverPath}`
      this.setStatus('server', 'error', message)
      throw new Error(message)
    }

    this.setStatus('server', 'starting')
    this.setStatus('tunnel', 'starting')

    if (await probeServer(this.config.servicePort)) {
      const message = `Port ${this.config.servicePort} sudah dipakai proses lain. Tutup KinoSave yang lain, lalu coba lagi.`
      this.setStatus('server', 'error', message)
      throw new Error(message)
    }

    const logDir = path.join(this.workDir, 'logs')
    fs.mkdirSync(logDir, { recursive: true })
    fs.mkdirSync(path.join(this.workDir, 'downloads'), { recursive: true })

    this.server = spawn(process.execPath, [serverPath], {
      cwd: this.workDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(this.config.servicePort),
        HOST: '127.0.0.1',
        PUBLIC_BASE_URL: `https://${this.config.hostname}`,
        LOCAL_DOWNLOAD_API_KEY: apiKey || '',
        LOCAL_DOWNLOAD_API_KEY_HASHES: keyHashes.join(','),
        LOG_FILE: path.join(logDir, 'server.log'),
      },
    })
    this.capture(this.server, 'server', 'server')

    const serverReady = await waitForServer(this.config.servicePort, this.server)
    if (!serverReady) {
      this.stop()
      const detail = this.lastExit?.detail ? ` (${this.lastExit.detail})` : ''
      const message = `Server downloader gagal start dalam 30 detik.${detail}`
      this.setStatus('server', 'error', message)
      throw new Error(message)
    }
    if (this.server.exitCode !== null) {
      const detail = this.lastExit?.detail ? ` (${this.lastExit.detail})` : ''
      this.stop()
      const message = `Server downloader langsung berhenti.${detail}`
      this.setStatus('server', 'error', message)
      throw new Error(message)
    }
    this.setStatus('server', 'running')

    if (this.config.manageTunnel === false) {
      this.log('tunnel: memakai Cloudflare Tunnel dari service Windows yang sudah jalan.')
      this.setStatus('tunnel', 'running')
      return this.status
    }
    const tunnelConfigPath = writeTunnelConfig(this.config)
    const tunnelOutput = []
    this.tunnel = spawn(resolveBinary('cloudflared'), ['tunnel', '--config', tunnelConfigPath, 'run', this.config.tunnelName], {
      cwd: this.workDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.capture(this.tunnel, 'tunnel', 'tunnel')
    this.tunnel.stderr?.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.trim()) tunnelOutput.push(line.trim())
      }
    })

    const tunnelReady = await waitForTunnel(this.tunnel, tunnelOutput)
    if (!tunnelReady) {
      this.stop()
      const message = 'Cloudflare Tunnel gagal terhubung dalam 45 detik.'
      this.setStatus('tunnel', 'error', message)
      throw new Error(message)
    }
    this.setStatus('tunnel', 'running')

    return this.status
  }

  stop() {
    killProcessTree(this.tunnel)
    killProcessTree(this.server)
    this.tunnel = null
    this.server = null
    this.status = { server: 'stopped', tunnel: 'stopped', error: null }
    this.emit()
  }

  isRunning() {
    return Boolean(this.server || this.tunnel)
  }

  async checkConnection() {
    const endpoint = `${this.config.websiteUrl.replace(/\/+$/, '')}/api/info`
    try {
      const response = await requestJson(endpoint, { url: 'https://www.youtube.com/watch?v=BaW_jenozKc' })
      if (response.status === 200) {
        return { ok: true, message: 'Website Vercel berhasil menjangkau server lokal. Kunci API cocok.' }
      }
      if (response.status === 401) {
        return { ok: false, message: 'Server lokal menolak kunci API dari Vercel. Kunci di .env.local tidak sama dengan kunci production.' }
      }
      if (response.status === 502) {
        return { ok: false, message: 'Server lokal tidak dapat dihubungi dari website. Periksa tunnel dan MEDIA_PROVIDER_URL di Vercel.' }
      }
      return { ok: false, message: `Website Vercel menjawab status ${response.status}.` }
    } catch (error) {
      return { ok: false, message: `Gagal menghubungi website: ${error.message}` }
    }
  }
}

module.exports = { ServiceManager, readApiKey, resolveBinary, which }
