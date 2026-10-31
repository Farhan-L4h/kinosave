import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

const HISTORY_KEY = 'kinosave_history'
const MAX_HISTORY = 20

type Platform = 'youtube' | 'tiktok' | 'instagram'
type Format = 'video' | 'audio'
type Quality = '360' | '480' | '720' | '1080' | '1440' | '2160'
type Fps = 24 | 25 | 30 | 48 | 50 | 60

interface HistoryEntry {
  id: string
  url: string
  platform: Platform
  format: Format
  createdAt: string
  status: 'completed' | 'pending'
}

interface DownloadResult {
  downloadUrl: string
  filename: string
  platform: Platform
  logs?: string[]
}

interface DebugLog {
  id: string
  time: string
  message: string
}

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
}

function detectPlatform(value: string): Platform | null {
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      return parsed.pathname === '/watch' && parsed.searchParams.has('v') ? 'youtube' : null
    }
    if (hostname === 'youtu.be') {
      return parsed.pathname.length > 1 && parsed.pathname.slice(1).length >= 6 ? 'youtube' : null
    }
    if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return 'tiktok'
    if (hostname === 'instagram.com' || hostname.endsWith('.instagram.com')) return 'instagram'
  } catch {
    return null
  }
  return null
}

function readHistory(): HistoryEntry[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
}

function platformMark(platform: Platform) {
  return platform === 'youtube' ? 'YT' : platform === 'tiktok' ? 'TK' : 'IG'
}

export default function KinoSave() {
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState<Format>('video')
  const [quality, setQuality] = useState<Quality>('1080')
  const [fps, setFps] = useState<Fps>(30)
  const [availableQualities, setAvailableQualities] = useState<Quality[]>([])
  const [availableFps, setAvailableFps] = useState<Fps[]>([])
  const [isInfoLoading, setIsInfoLoading] = useState(false)
  const [infoProgress, setInfoProgress] = useState(12)
  const [videoTitle, setVideoTitle] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [cancelController, setCancelController] = useState<AbortController | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<DownloadResult | null>(null)
  const [notice, setNotice] = useState('')
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([])
  const [isLogOpen, setIsLogOpen] = useState(false)
    const [backendLogs, setBackendLogs] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')

  useEffect(() => {
    setHistory(readHistory())
  }, [])

  useEffect(() => {
    const value = url.trim()
    if (!value) {
      setIsInfoLoading(false)
      setInfoProgress(0)
      setAvailableQualities([])
      setAvailableFps([])
      return
    }
    if (detectPlatform(value) !== 'youtube') {
      setIsInfoLoading(false)
      setInfoProgress(0)
      setAvailableQualities([])
      setError('Link tidak valid. Gunakan link HTTPS dari YouTube.')
      return
    }
    const timer = window.setTimeout(() => { void loadAvailableQualities(value) }, 450)
    return () => window.clearTimeout(timer)
  // Metadata lookup runs after URL changes, with debounce to avoid duplicate requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const detectedPlatform = useMemo(() => detectPlatform(url.trim()), [url])

  async function loadAvailableQualities(value: string) {
    if (detectPlatform(value) !== 'youtube') {
      setAvailableQualities([])
      return
    }
    setIsInfoLoading(true)
    setInfoProgress(18)
    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      })
      const data = await response.json() as { title?: unknown; resolutions?: unknown; fps?: unknown }
      if (!response.ok || !Array.isArray(data.resolutions) || data.resolutions.length === 0) return
      if (typeof data.title === 'string') setVideoTitle(data.title)
      const next = data.resolutions
        .filter((item): item is string => typeof item === 'string')
        .filter((item): item is Quality => ['360', '480', '720', '1080', '1440', '2160'].includes(item as Quality))
      const nextFps = Array.isArray(data.fps)
        ? data.fps.filter((item): item is Fps => [24, 25, 30, 48, 50, 60].includes(item as Fps))
        : []
      if (next.length > 0) {
        setAvailableQualities(next)
        setAvailableFps(nextFps)
        if (nextFps.length > 0 && !nextFps.includes(fps)) setFps(nextFps[nextFps.length - 1])
        setInfoProgress(100)
        if (!next.includes(quality)) setQuality(next[next.length - 1])
        addDebugLog(`Metadata berhasil: judul="${typeof data.title === 'string' ? data.title : 'tanpa judul'}"; resolusi=${next.map((item) => `${item}p`).join(', ')}.`)
      }
    } catch {
      setAvailableQualities([])
      setInfoProgress(0)
      addDebugLog('Metadata gagal: resolusi media belum tersedia.')
    } finally {
      setIsInfoLoading(false)
    }
  }

  function resetFeedback() {
    setError('')
    setResult(null)
    setNotice('')
    setProgress(0)
    setProgressLabel('')
  }

  function addDebugLog(message: string) {
    setDebugLogs((current) => [...current.slice(-19), {
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString('id-ID'),
      message,
    }])
  }

    function addBackendLog(message: string) {
      setBackendLogs((current) => [...current.slice(-19), message])
    }

  function addHistory(value: string, platform: Platform, selectedFormat: Format, status: HistoryEntry['status']) {
    const next: HistoryEntry = {
      id: crypto.randomUUID(),
      url: value,
      platform,
      format: selectedFormat,
      createdAt: new Date().toISOString(),
      status,
    }
    const updated = [next, ...history.filter((entry) => entry.url !== value || entry.format !== selectedFormat)]
    setHistory(updated.slice(0, MAX_HISTORY))
    saveHistory(updated)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    resetFeedback()
    const normalizedUrl = url.trim()
    const platform = detectPlatform(normalizedUrl)

    if (!normalizedUrl) {
      setError('Tempelkan link terlebih dahulu.')
      addDebugLog('Validasi gagal: URL kosong.')
      return
    }
    if (platform !== 'youtube') {
      setError('Link harus berasal dari YouTube.')
      addDebugLog(`Validasi gagal: host bukan YouTube (${platform || 'tidak dikenali'}).`)
      return
    }
    if (isInfoLoading || availableQualities.length === 0) {
      setError('Tunggu kualitas media selesai dimuat sebelum memproses link.')
      addDebugLog('Validasi gagal: resolusi belum tersedia.')
      return
    }

    setIsLoading(true)
    setProgress(8)
    setProgressLabel('Menghubungi server downloader...')
    addDebugLog(`Memulai request: format=${format.toUpperCase()}, kualitas=${quality}p, URL=${normalizedUrl}`)
    addDebugLog('Validasi lolos: host YouTube dan kualitas media tersedia.')
    addHistory(normalizedUrl, platform, format, 'pending')

    let progressTimer: number | undefined
    const controller = new AbortController()
    setCancelController(controller)
    try {
      progressTimer = window.setInterval(() => {
        setProgress((current) => {
          if (current >= 88) return current
          if (current < 35) setProgressLabel('Mengambil metadata YouTube...')
          else if (current < 70) setProgressLabel(format === 'video' ? 'Mengunduh dan menggabungkan media...' : 'Mengunduh dan menyiapkan MP3...')
          else setProgressLabel(format === 'video' ? 'Mengonversi ke MP4 kompatibel...' : 'Menyiapkan file audio...')
          return Math.min(current + 4, 88)
        })
      }, 900)
      addDebugLog('Mengirim request POST /api/download ke backend.')
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl, quality, fps, format }),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({}))
      window.clearInterval(progressTimer)
      const responseMessage = typeof data.error === 'string' ? data.error : `HTTP ${response.status}`
      addDebugLog(`Response backend: HTTP ${response.status}; status=${response.ok ? 'OK' : 'GAGAL'}${data.error ? `; pesan="${responseMessage}"` : '; payload diterima'}`)
      if (Array.isArray(data.logs)) data.logs.forEach((entry: unknown) => { if (typeof entry === 'string') addBackendLog(entry) })
      if (!response.ok) throw new Error(data.error || 'Layanan download belum tersedia.')
      if (!data.downloadUrl) {
        addDebugLog(`Response gagal: downloadUrl tidak ada; keys=${Object.keys(data).join(', ') || 'kosong'}.`)
        throw new Error('Server tidak mengembalikan link download.')
      }

      const extension = format === 'audio' ? 'mp3' : 'mp4'
      const filename = typeof data.filename === 'string' && data.filename.trim()
        ? data.filename
        : `${videoTitle || 'kinosave-download'}.${extension}`
      setResult({ downloadUrl: data.downloadUrl, filename, platform })
      setProgress(100)
      setProgressLabel('Selesai. File siap diunduh.')
      addDebugLog(`Download siap: ${filename}.`)
      addHistory(normalizedUrl, platform, format, 'completed')
    } catch (requestError) {
      const message = requestError instanceof DOMException && requestError.name === 'AbortError'
        ? 'Download dibatalkan.'
        : requestError instanceof Error ? requestError.message : 'Terjadi kesalahan. Coba lagi.'
      addDebugLog(`Request gagal: ${message}`)
      setError(message)
    } finally {
      if (progressTimer !== undefined) window.clearInterval(progressTimer)
      setCancelController(null)
      setIsLoading(false)
    }
  }

  async function pasteFromClipboard() {
    try {
      setUrl(await navigator.clipboard.readText())
      setNotice('Link berhasil ditempel.')
      setError('')
    } catch {
      setNotice('Clipboard tidak tersedia. Tempel link secara manual.')
    }
  }

  function handleHistoryClick(entry: HistoryEntry) {
    setUrl(entry.url)
    setFormat(entry.format)
    setIsModalOpen(true)
    resetFeedback()
  }

  function clearHistory() {
    setHistory([])
    saveHistory([])
    setNotice('Riwayat telah dibersihkan.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="KinoSave home">
          <span className="brand-mark">KS</span>
          <span>KINOSAVE</span>
        </a>
        <span className="topbar-note">FARHAN-L4h</span>
      </header>

      <main className="page-content">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">MEDIA LINK TOOL</p>
            <h1>Buat Download Vidio/Music Ya Cuy.</h1>
            <p className="hero-description">Malas untuk Ribet.</p>
            <button className="primary-button hero-button" onClick={() => setIsModalOpen(true)}>PASTE LINK <span aria-hidden="true">↗</span></button>
          </div>
          <div className="hero-stamp" aria-hidden="true">
            <span>FAST</span>
            <strong>KS</strong>
            <span>01</span>
          </div>
        </section>

        <section className="workspace-grid">
          <div className="download-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">NEW DOWNLOAD</p>
                <h2>Drop your link.</h2>
              </div>
              <span className="counter">01</span>
            </div>
            <form onSubmit={handleSubmit}>
              <label htmlFor="media-url">Media URL</label>
              <div className="url-input-wrap">
                <input
                  id="media-url"
                  value={url}
                  onChange={(event) => { setUrl(event.target.value); resetFeedback() }}
                  placeholder="https://..."
                  autoComplete="off"
                />
                {url && <button type="button" className="paste-button" onClick={() => { setUrl(''); resetFeedback() }}>CLEAR</button>}
                {!url && <button type="button" className="paste-button" onClick={pasteFromClipboard}>PASTE</button>}
              </div>
              <div className="form-row">
                <div className="format-control">
                  <label htmlFor="format">Format</label>
                  <select id="format" value={format} onChange={(event) => { setFormat(event.target.value as Format); resetFeedback() }}>
                    <option value="video">VIDEO / MP4</option>
                    <option value="audio">AUDIO / MP3</option>
                  </select>
                </div>
                <div className="format-control">
                  <label htmlFor="quality">Quality</label>
                  <select id="quality" value={quality} onChange={(event) => { setQuality(event.target.value as Quality); resetFeedback() }} disabled={format === 'audio' || isInfoLoading || availableQualities.length === 0}>
                    {availableQualities.length === 0 && <option value="">{isInfoLoading ? 'LOADING...' : 'ENTER YOUTUBE URL'}</option>}
                    {availableQualities.map((item) => <option key={item} value={item}>{item}P</option>)}
                  </select>
                </div>
                <div className="format-control">
                  <label htmlFor="fps">FPS</label>
                  <select id="fps" value={fps} onChange={(event) => { setFps(Number(event.target.value) as Fps); resetFeedback() }} disabled={format === 'audio' || isInfoLoading || availableFps.length === 0}>
                    {availableFps.length === 0 && <option value="">{isInfoLoading ? 'LOADING...' : 'ENTER YOUTUBE URL'}</option>}
                    {availableFps.map((item) => <option key={item} value={item}>{item} FPS</option>)}
                  </select>
                </div>
                <div className="platform-detected">
                  <span>Platform</span>
                  <strong>{detectedPlatform ? PLATFORM_LABELS[detectedPlatform] : 'WAITING...'}</strong>
                </div>
              </div>
              <button className="primary-button submit-button" type={isLoading ? 'button' : 'submit'} onClick={isLoading ? () => cancelController?.abort() : undefined} disabled={isInfoLoading || (!isLoading && Boolean(url.trim()) && detectedPlatform === 'youtube' && availableQualities.length === 0)}>
                {isLoading ? 'CANCEL DOWNLOAD' : isInfoLoading ? <><span className="button-loader" aria-hidden="true" /> LOADING MEDIA...</> : 'PROCESS LINK'} {!isLoading && <span aria-hidden="true">↗</span>}
              </button>
              {isInfoLoading && (
                <div className="progress-area" role="status" aria-live="polite">
                  <div className="progress-meta"><span>Mengambil metadata YouTube...</span><strong>{infoProgress}%</strong></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${infoProgress}%` }} /></div>
                  <small>Menyiapkan pilihan format dan resolusi.</small>
                </div>
              )}
              {isLoading && (
                <div className="progress-area" role="status" aria-live="polite">
                  <div className="progress-meta"><span>{progressLabel}</span><strong>{progress}%</strong></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
                  <small>Jangan tutup halaman sampai proses selesai.</small>
                </div>
              )}
              {notice && <p className="notice" role="status">{notice}</p>}
              {error && <p className="error-message" role="alert">{error}</p>}
              {result && (
                <div className="result-box">
                  <div>
                    <span className="result-label">READY TO SAVE</span>
                    <strong>{result.filename}</strong>
                  </div>
                  <a className="secondary-button" href={result.downloadUrl} target="_blank" rel="noreferrer">DOWNLOAD</a>
                </div>
              )}
            </form>
            <section className="debug-log">
              <button className="debug-log-toggle" type="button" onClick={() => setIsLogOpen((open) => !open)} aria-expanded={isLogOpen}>
                {isLogOpen ? 'HIDE DEBUG LOG' : 'SHOW DEBUG LOG'} <span>{debugLogs.length ? `(${debugLogs.length})` : ''}</span>
              </button>
              {isLogOpen && (
                <div className="debug-log-box" role="log" aria-live="polite">
                              {debugLogs.length === 0 && backendLogs.length === 0 ? (
                    <p>Belum ada aktivitas.</p>
                  ) : (
                                <>
                                  <div className="debug-log-section">
                                    <h4>Frontend Logs</h4>
                                    {debugLogs.length === 0 ? <p className="empty-log">Tidak ada log.</p> : debugLogs.map((entry) => <p key={entry.id}><time>{entry.time}</time> {entry.message}</p>)}
                                    {debugLogs.length > 0 && <button className="debug-log-clear" type="button" onClick={() => setDebugLogs([])}>CLEAR FRONTEND LOGS</button>}
                                  </div>
                                  {backendLogs.length > 0 && (
                                    <div className="debug-log-section">
                                      <h4>Backend Logs</h4>
                                      {backendLogs.map((entry, index) => <p key={index} className="backend-log">{entry}</p>)}
                                      <button className="debug-log-clear" type="button" onClick={() => setBackendLogs([])}>CLEAR BACKEND LOGS</button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </section>
            <p className="legal-note">Gunakan hanya untuk konten yang kamu miliki atau diizinkan untuk disimpan.</p>
          </div>

          <aside className="history-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">YOUR LINKS</p>
                <h2>History.</h2>
              </div>
              <span className="counter">{String(history.length).padStart(2, '0')}</span>
            </div>
            {history.length === 0 ? (
              <div className="empty-history">
                <span className="empty-icon">+</span>
                <p>Belum ada link di sini.</p>
                <small>Link yang diproses akan muncul otomatis.</small>
              </div>
            ) : (
              <>
                <div className="history-list">
                  {history.map((entry) => (
                    <button className="history-item" key={entry.id} onClick={() => handleHistoryClick(entry)}>
                      <span className={`platform-mark ${entry.platform}`}>{platformMark(entry.platform)}</span>
                      <span className="history-info">
                        <strong>{PLATFORM_LABELS[entry.platform]} / {entry.format.toUpperCase()}</strong>
                        <small>{entry.url}</small>
                      </span>
                      <span className="history-date">{formatDate(entry.createdAt)}</span>
                    </button>
                  ))}
                </div>
                <button className="clear-button" onClick={clearHistory}>CLEAR HISTORY</button>
              </>
            )}
          </aside>
        </section>

        <footer className="footer-bar">
          <span>SUPPORTED: YOUTUBE</span>
          <span>YOUR DATA STAYS IN THIS BROWSER</span>
        </footer>
      </main>

      {isModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsModalOpen(false) }}>
          <section className="link-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button className="close-button" onClick={() => setIsModalOpen(false)} aria-label="Tutup modal">×</button>
            <p className="eyebrow">QUICK START</p>
            <h2 id="modal-title">Paste. Process. Save.</h2>
            <p>Masukkan link media kamu untuk memulai.</p>
            <form onSubmit={(event) => { void handleSubmit(event); setIsModalOpen(false) }}>
              <label htmlFor="modal-url">Media URL</label>
              <input id="modal-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." autoFocus />
              <button className="primary-button submit-button" type="submit">PROCESS LINK <span aria-hidden="true">↗</span></button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
