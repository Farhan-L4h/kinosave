import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

const HISTORY_KEY = 'kinosave_history'
const MAX_HISTORY = 20

type Platform = 'youtube' | 'tiktok' | 'instagram'
type Format = 'video' | 'audio'

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
}

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
}

function detectPlatform(value: string): Platform | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
    if (hostname === 'youtube.com' || hostname === 'youtu.be' || hostname.endsWith('.youtube.com')) return 'youtube'
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
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<DownloadResult | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setHistory(readHistory())
  }, [])

  const detectedPlatform = useMemo(() => detectPlatform(url.trim()), [url])

  function resetFeedback() {
    setError('')
    setResult(null)
    setNotice('')
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
      return
    }
    if (!platform) {
      setError('Link harus berasal dari YouTube, TikTok, atau Instagram.')
      return
    }

    setIsLoading(true)
    addHistory(normalizedUrl, platform, format, 'pending')

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl, format }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Layanan download belum tersedia.')
      if (!data.downloadUrl) throw new Error('Server tidak mengembalikan link download.')

      setResult({ downloadUrl: data.downloadUrl, filename: data.filename || 'kinosave-download', platform })
      addHistory(normalizedUrl, platform, format, 'completed')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Terjadi kesalahan. Coba lagi.')
    } finally {
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
        <span className="topbar-note">LOCAL-FIRST / VERCEL READY</span>
      </header>

      <main className="page-content">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">MEDIA LINK TOOL</p>
            <h1>Download tanpa muter-muter.</h1>
            <p className="hero-description">Satu tempat untuk memproses link YouTube, TikTok, dan Instagram.</p>
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
                <button type="button" className="paste-button" onClick={pasteFromClipboard}>PASTE</button>
              </div>
              <div className="form-row">
                <div className="format-control">
                  <label htmlFor="format">Format</label>
                  <select id="format" value={format} onChange={(event) => setFormat(event.target.value as Format)}>
                    <option value="video">VIDEO / MP4</option>
                    <option value="audio">AUDIO / MP3</option>
                  </select>
                </div>
                <div className="platform-detected">
                  <span>Platform</span>
                  <strong>{detectedPlatform ? PLATFORM_LABELS[detectedPlatform] : 'WAITING...'}</strong>
                </div>
              </div>
              <button className="primary-button submit-button" type="submit" disabled={isLoading}>
                {isLoading ? 'PROCESSING...' : 'PROCESS LINK'} <span aria-hidden="true">↗</span>
              </button>
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
          <span>SUPPORTED: YOUTUBE / TIKTOK / INSTAGRAM</span>
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
