const ALLOWED_HOSTS = new Set(['youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com'])
const MAX_URL_LENGTH = 2048
const PROVIDER_TIMEOUT_MS = 15_000

type DownloadFormat = 'video' | 'audio'

interface DownloadRequest {
  url?: unknown
  format?: unknown
}

interface ProviderResponse {
  status?: string
  url?: string
  filename?: string
  error?: { code?: string }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function isAllowedSource(value: string) {
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')
    return parsed.protocol === 'https:' && [...ALLOWED_HOSTS].some((host) => hostname === host || hostname.endsWith(`.${host}`))
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
  if (code.includes('rate')) return 'Provider sedang membatasi permintaan. Coba lagi nanti.'
  if (code.includes('url') || code.includes('invalid')) return 'Link tidak dapat diproses oleh provider.'
  if (code.includes('auth')) return 'Konfigurasi autentikasi provider belum benar.'
  return 'Media tidak tersedia atau provider gagal memprosesnya.'
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method tidak didukung.' }, 405)
  }
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 16_384) {
    return json({ error: 'Request terlalu besar.' }, 413)
  }

  let body: DownloadRequest
  try {
    body = await request.json() as DownloadRequest
  } catch {
    return json({ error: 'Request harus berupa JSON yang valid.' }, 400)
  }

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const format: DownloadFormat = body.format === 'audio' ? 'audio' : 'video'

  if (!url || url.length > MAX_URL_LENGTH || !isAllowedSource(url)) {
    return json({ error: 'URL HTTPS YouTube, TikTok, atau Instagram yang valid wajib diisi.' }, 400)
  }

  const endpoint = providerEndpoint()
  if (!endpoint) {
    return json({ error: 'Downloader belum dikonfigurasi. Tambahkan MEDIA_PROVIDER_URL di environment Vercel.' }, 503)
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
        downloadMode: format === 'audio' ? 'audio' : 'auto',
        audioFormat: format === 'audio' ? 'mp3' : undefined,
        audioBitrate: format === 'audio' ? '128' : undefined,
        videoQuality: format === 'video' ? '1080' : undefined,
        filenameStyle: 'basic',
      }),
      signal: controller.signal,
    })
    const providerData = await providerResponse.json() as ProviderResponse

    if (!providerResponse.ok || providerData.status === 'error') {
      return json({ error: providerErrorMessage(providerData.error?.code) }, 502)
    }
    if (providerData.status !== 'redirect' && providerData.status !== 'tunnel') {
      return json({ error: 'Provider mengembalikan format hasil yang belum didukung.' }, 502)
    }
    if (!providerData.url) {
      return json({ error: 'Provider tidak mengembalikan URL download.' }, 502)
    }

    return json({
      downloadUrl: providerData.url,
      filename: providerData.filename || `kinosave.${format === 'audio' ? 'mp3' : 'mp4'}`,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return json({ error: 'Provider terlalu lama merespons. Coba lagi.' }, 504)
    }
    console.error('media provider request failed', error)
    return json({ error: 'Layanan download sedang tidak tersedia.' }, 502)
  } finally {
    clearTimeout(timeout)
  }
}
