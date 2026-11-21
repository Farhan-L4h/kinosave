import type { VercelRequest, VercelResponse } from '@vercel/node'

function json(response: VercelResponse, body: Record<string, unknown>, status = 200) {
  return response.status(status).setHeader('Cache-Control', 'no-store').json(body)
}

function statusEndpoint(jobId: string) {
  const base = process.env.MEDIA_PROVIDER_URL?.trim()
  if (!base) return null
  try {
    const endpoint = new URL(base)
    endpoint.pathname = endpoint.pathname.replace(/\/api\/download\/?$/, '/api/status')
    endpoint.searchParams.set('job', jobId)
    return endpoint.toString()
  } catch {
    return null
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    return json(response, { error: 'Method tidak didukung.' }, 405)
  }
  const rawJobId = request.query.job
  const jobId = typeof rawJobId === 'string' ? rawJobId : ''
  if (!jobId) {
    return json(response, { error: 'Parameter job wajib diisi.' }, 400)
  }

  const endpoint = statusEndpoint(jobId)
  if (!endpoint) {
    return json(response, { error: 'Downloader belum dikonfigurasi.' }, 503)
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  const apiKey = process.env.MEDIA_PROVIDER_API_KEY?.trim()
  if (apiKey) headers.Authorization = `Api-Key ${apiKey}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const providerResponse = await fetch(endpoint, { headers, signal: controller.signal })
    const providerData = await providerResponse.json() as Record<string, unknown>
    return json(response, providerData, providerResponse.status)
  } catch (error) {
    console.error('media provider status request failed', error)
    return json(response, {
      error: error instanceof Error && error.name === 'AbortError'
        ? 'Provider terlalu lama merespons.'
        : 'Status download sedang tidak tersedia.',
    }, 502)
  } finally {
    clearTimeout(timeout)
  }
}
