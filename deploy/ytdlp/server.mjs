import { createReadStream, existsSync, mkdirSync, readdir, readdirSync, rename, stat, unlink } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

const port = Number(process.env.PORT || 9001)
const host = process.env.HOST || '127.0.0.1'
const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '')
const downloadDir = join(process.cwd(), 'downloads')
const apiKey = process.env.LOCAL_DOWNLOAD_API_KEY?.trim()
const maxConcurrent = 2
const activeJobs = new Set()
const allowedHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])
const qualities = new Set(['360', '480', '720', '1080', '1440', '2160'])

mkdirSync(downloadDir, { recursive: true })
setInterval(() => {
  readdir(downloadDir, (readError, files) => {
    if (readError) return
    for (const file of files) {
      const filePath = join(downloadDir, file)
      stat(filePath, (statError, details) => {
        if (!statError && Date.now() - details.mtimeMs > 60 * 60 * 1000) unlink(filePath, () => {})
      })
    }
  })
}, 60 * 60 * 1000).unref()

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

function isYouTubeUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && allowedHosts.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 16_384) reject(new Error('Request terlalu besar.'))
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch {
        reject(new Error('Body JSON tidak valid.'))
      }
    })
    request.on('error', reject)
  })
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let error = ''
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { error += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(error.slice(-1000) || `${command} exited with ${code}`)))
  })
}

function safeFileTitle(value) {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned.slice(0, 160) || 'kinosave-download'
}

function availableFilePath(title, extension) {
  const base = `${title}.${extension}`
  let candidate = base
  let index = 2
  while (existsSync(join(downloadDir, candidate))) {
    candidate = `${title} (${index}).${extension}`
    index += 1
  }
  return { fileName: candidate, filePath: join(downloadDir, candidate) }
}

async function runDownload(url, quality, fps, format, outputTemplate, outputPath, id) {
  const args = [
    '--no-playlist',
    '--match-filter', 'duration <= 1800',
    '--output', outputTemplate,
    '--no-progress',
    '--newline',
    '--print', 'after_move:%(title)s',
  ]
  if (format === 'audio') {
    args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '128K')
  } else {
    args.push('--format', `bestvideo[height<=${quality}][fps<=${fps}]+bestaudio/best[height<=${quality}][fps<=${fps}]`, '--merge-output-format', 'mp4')
  }
  args.push(url)
  const commandOutput = await runCommand('yt-dlp', args)
  const title = safeFileTitle(commandOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() || '')
  const sourceName = readdirSync(downloadDir).find((file) => file.startsWith(`${id}.source.`))
  if (!sourceName) throw new Error('File video dari yt-dlp tidak ditemukan.')
  if (format === 'audio') {
    await new Promise((resolve, reject) => rename(join(downloadDir, sourceName), outputPath, (error) => error ? reject(error) : resolve()))
    return { title, fps: null }
  }
  await runCommand('ffmpeg', [
    '-y',
    '-i', join(downloadDir, sourceName),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ])
  unlink(join(downloadDir, sourceName), () => {})
  const fpsOutput = await runCommand('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'default=noprint_wrappers=1:nokey=1', outputPath])
  const fpsValue = Number(fpsOutput.trim().split('/')[0]) / Number(fpsOutput.trim().split('/')[1] || 1)
  return { title, fps: Number.isFinite(fpsValue) ? Math.round(fpsValue) : fps }
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url.startsWith('/files/')) {
    let fileName
    try {
      fileName = basename(decodeURIComponent(request.url.slice('/files/'.length)))
    } catch {
      return send(response, 400, { error: 'Nama file tidak valid.' })
    }
    const filePath = join(downloadDir, fileName)
    if (!existsSync(filePath)) return send(response, 404, { error: 'File tidak ditemukan atau sudah kedaluwarsa.' })
    const contentType = fileName.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4'
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    })
    return createReadStream(filePath).pipe(response)
  }
  if (request.method === 'POST' && request.url === '/api/info') {
    try {
      const body = await readBody(request)
      const url = typeof body.url === 'string' ? body.url.trim() : ''
      if (!isYouTubeUrl(url)) return send(response, 400, { error: 'URL HTTPS YouTube yang valid wajib diisi.' })
      const raw = await runCommand('yt-dlp', ['--dump-single-json', '--skip-download', '--no-playlist', url])
      const info = JSON.parse(raw)
      const resolutions = [...new Set((info.formats || [])
        .filter((item) => item.vcodec && item.vcodec !== 'none' && item.height)
        .map((item) => String(item.height))
        .filter((height) => qualities.has(height)))]
        .sort((a, b) => Number(a) - Number(b))
      const fps = [...new Set((info.formats || [])
        .filter((item) => item.vcodec && item.vcodec !== 'none' && item.fps)
        .map((item) => Math.round(Number(item.fps))))]
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b)
      return send(response, 200, { title: safeFileTitle(info.title || ''), resolutions, fps })
    } catch (error) {
      console.error('local yt-dlp info failed', error)
      return send(response, 502, { error: 'Metadata YouTube tidak dapat diambil.' })
    }
  }
  if (request.method !== 'POST' || request.url !== '/api/download') return send(response, 404, { error: 'Route tidak ditemukan.' })
  if (apiKey && request.headers.authorization !== `Api-Key ${apiKey}`) return send(response, 401, { error: 'API key lokal tidak valid.' })
  try {
    const body = await readBody(request)
    const url = typeof body.url === 'string' ? body.url.trim() : ''
    const format = body.format === 'audio' || body.downloadMode === 'audio' ? 'audio' : 'video'
    const requestedQuality = body.quality ?? body.videoQuality
    const quality = typeof requestedQuality === 'string' && qualities.has(requestedQuality) ? requestedQuality : '720'
    const requestedFps = Number(body.fps)
    const fps = [24, 25, 30, 48, 50, 60].includes(requestedFps) ? requestedFps : 60
    if (!isYouTubeUrl(url)) return send(response, 400, { error: 'URL HTTPS YouTube yang valid wajib diisi.' })
    if (activeJobs.size >= maxConcurrent) return send(response, 429, { error: 'Server lokal sedang sibuk. Coba lagi.' })
    const id = randomUUID()
    const extension = format === 'audio' ? 'mp3' : 'mp4'
    const outputTemplate = join(downloadDir, `${id}.source.%(ext)s`)
    const outputPath = join(downloadDir, `${id}.${extension}`)
    activeJobs.add(id)
    try {
      const result = await runDownload(url, quality, fps, format, outputTemplate, outputPath, id)
      const title = `${result.title} - ${quality}p${result.fps ? ` ${result.fps}fps` : ''}`
      if (!existsSync(outputPath)) throw new Error('File hasil download tidak ditemukan.')
      const finalFile = availableFilePath(title, extension)
      await new Promise((resolve, reject) => rename(outputPath, finalFile.filePath, (error) => error ? reject(error) : resolve()))
      return send(response, 200, {
        status: 'tunnel',
        url: `${publicBaseUrl || `http://${host}:${port}`}/files/${encodeURIComponent(finalFile.fileName)}`,
        filename: finalFile.fileName,
      })
    } finally {
      activeJobs.delete(id)
    }
  } catch (error) {
    console.error('local yt-dlp download failed', error)
    return send(response, 502, { error: 'Download lokal gagal. Pastikan yt-dlp dan ffmpeg sudah terpasang.' })
  }
})

server.listen(port, host, () => console.log(`Local yt-dlp server listening on http://${host}:${port}`))
