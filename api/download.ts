import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])
const MAX_URL_LENGTH = 2048
const PROVIDER_TIMEOUT_MS = 300_000

type DownloadFormat = 'video' | 'audio'
type DownloadQuality = '144' | '240' | '360' | '480' | '720' | '1080' | '1440' | '2160' | 'max'
const ALLOWED_QUALITIES: DownloadQuality[] = ['144', '240', '360', '480', '720', '1080', '1440', '2160', 'max']

interface DownloadRequest {
  url?: unknown
  quality?: unknown
  format?: unknown
}

interface ProviderResponse {
  status?: string
  url?: string
  filename?: string
  error?: { code?: string }
  picker?: Array<{ type?: string; url?: string }>
}

function json(response: VercelResponse, body: Record<string, unknown>, status = 200) {
  return response.status(status).setHeader('Cache-Control', 'no-store').json(body)
}

function isAllowedSource(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

function providerEndpoint() {
  const base = process.env.MEDIA_PROVIDER_URL?.trim()
  if (!base) return null
  try {
    return new URL(base).toString()
  } catch {
    return null
  }
}

function providerErrorMessage(code?: string) {
  if (!code) return 'Provider gagal memproses link.'
  const normalizedCode = code.toLowerCase()
  if (normalizedCode.includes('rate') || normalizedCode.includes('limit')) return 'Provider sedang membatasi permintaan. Coba lagi nanti.'
  if (normalizedCode.includes('url') || normalizedCode.includes('invalid')) return 'Link YouTube tidak dapat diproses oleh provider.'
  if (normalizedCode.includes('auth')) return 'Konfigurasi autentikasi provider belum benar.'
  if (normalizedCode.includes('login') || normalizedCode.includes('bot')) return 'YouTube meminta verifikasi tambahan. Coba lagi atau gunakan server dengan konfigurasi cookies yang sesuai.'
  if (normalizedCode.includes('format')) return 'Resolusi atau format yang dipilih tidak tersedia untuk video ini.'
  return 'Media tidak tersedia atau provider gagal memprosesnya.'
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    return json(response, { error: 'Method tidak didukung.' }, 405)
  }
  const contentLength = Number(request.headers['content-length'] || 0)
  if (contentLength > 16_384) {
    return json(response, { error: 'Request terlalu besar.' }, 413)
  }

  const body = (typeof request.body === 'object' && request.body !== null ? request.body : {}) as DownloadRequest

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (body.format !== undefined && body.format !== 'video' && body.format !== 'audio') {
    return json(response, { error: 'Format harus berupa video atau audio.' }, 400)
  }
  if (body.quality !== undefined && (typeof body.quality !== 'string' || !ALLOWED_QUALITIES.includes(body.quality as DownloadQuality))) {
    return json(response, { error: 'Resolusi tidak didukung. Pilih resolusi antara 144p dan 2160p.' }, 400)
  }
  const format: DownloadFormat = body.format === 'audio' ? 'audio' : 'video'
  const quality: DownloadQuality = typeof body.quality === 'string' ? body.quality as DownloadQuality : '720'

  if (!url || url.length > MAX_URL_LENGTH || !isAllowedSource(url)) {
    return json(response, { error: 'URL HTTPS YouTube yang valid wajib diisi.' }, 400)
  }

  const endpoint = providerEndpoint()
  if (!endpoint) {
    return json(response, { error: 'Downloader belum dikonfigurasi. Tambahkan MEDIA_PROVIDER_URL di environment Vercel.' }, 503)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)

  try {
    const providerHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    const apiKey = process.env.MEDIA_PROVIDER_API_KEY?.trim()
    if (apiKey) providerHeaders.Authorization = `Api-Key ${apiKey}`

    const providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: providerHeaders,
      body: JSON.stringify({
        url,
        videoQuality: quality,
        downloadMode: format === 'audio' ? 'audio' : 'auto',
        audioFormat: 'mp3',
        filenameStyle: 'basic',
        youtubeVideoCodec: 'h264',
      }),
      signal: controller.signal,
    })
    const providerData = await providerResponse.json() as ProviderResponse

    if (!providerResponse.ok || providerData.status === 'error') {
      return json(response, { error: providerErrorMessage(providerData.error?.code) }, 502)
    }
    if (providerData.status === 'picker') {
      const firstItem = providerData.picker?.find((item) => item.url)
      if (!firstItem?.url) return json(response, { error: 'Provider tidak mengembalikan media yang dapat diunduh.' }, 502)
      return json(response, {
        downloadUrl: firstItem.url,
        filename: `kinosave.${firstItem.type === 'audio' ? 'mp3' : 'mp4'}`,
      })
    }
    if (providerData.status === 'local-processing') {
      return json(response, { error: 'Provider meminta pemrosesan lokal yang belum didukung oleh KinoSave.' }, 502)
    }
    if (providerData.status !== 'redirect' && providerData.status !== 'tunnel') {
      return json(response, { error: 'Provider mengembalikan status yang belum didukung.' }, 502)
    }
    if (!providerData.url) {
      return json(response, { error: 'Provider tidak mengembalikan URL download.' }, 502)
    }

    return json(response, {
      downloadUrl: providerData.url,
      filename: providerData.filename || `kinosave.${format === 'audio' ? 'mp3' : 'mp4'}`,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return json(response, { error: 'Provider terlalu lama merespons. Coba lagi.' }, 504)
    }
    const reason = error instanceof Error ? error.message : ''
    console.error('media provider request failed', error)
    return json(response, {
      error: reason.includes('ECONNREFUSED') || reason.includes('fetch failed')
        ? 'Server downloader lokal tidak dapat dihubungi. Jalankan Cobalt atau service yt-dlp, lalu periksa MEDIA_PROVIDER_URL.'
        : 'Layanan download sedang tidak tersedia.',
    }, 502)
  } finally {
    clearTimeout(timeout)
  }
}
