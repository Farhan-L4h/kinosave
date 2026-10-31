import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])

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

function infoEndpoint() {
  const configured = process.env.MEDIA_PROVIDER_URL?.trim()
  if (!configured) return null
  try {
    const endpoint = new URL(configured)
    endpoint.pathname = endpoint.pathname.replace(/\/api\/download\/?$/, '/api/info')
    return endpoint.toString()
  } catch {
    return null
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') return json(response, { error: 'Method tidak didukung.' }, 405)
  const body = (typeof request.body === 'object' && request.body !== null ? request.body : {}) as { url?: unknown }
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url || !isAllowedSource(url)) return json(response, { error: 'URL HTTPS YouTube yang valid wajib diisi.' }, 400)

  const endpoint = infoEndpoint()
  if (!endpoint) return json(response, { error: 'Downloader belum dikonfigurasi.' }, 503)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    const apiKey = process.env.MEDIA_PROVIDER_API_KEY?.trim()
    if (apiKey) headers.Authorization = `Api-Key ${apiKey}`
    const providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })
    const providerData = await providerResponse.json() as Record<string, unknown>
    return json(response, providerData, providerResponse.status)
  } catch (error) {
    console.error('media provider info request failed', error)
    return json(response, {
      error: error instanceof Error && error.name === 'AbortError'
        ? 'Provider terlalu lama merespons.'
        : 'Metadata resolusi sedang tidak tersedia.',
    }, 502)
  } finally {
    clearTimeout(timeout)
  }
}
