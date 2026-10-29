import { defineConfig, loadEnv } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import downloadHandler from './api/download'

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 16_384) reject(new Error('Request terlalu besar.'))
    })
    request.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Body JSON tidak valid.'))
      }
    })
    request.on('error', reject)
  })
}

function localApiMiddleware(request: IncomingMessage, response: ServerResponse, next: () => void) {
  if (request.url !== '/api/download') return next()

  void readJsonBody(request)
    .then(async (body) => {
      let statusCode = 200
      const headers = new Map<string, string>()
      const vercelResponse = {
        status(code: number) {
          statusCode = code
          return vercelResponse
        },
        setHeader(name: string, value: string) {
          headers.set(name, value)
          return vercelResponse
        },
        json(payload: Record<string, unknown>) {
          response.statusCode = statusCode
          for (const [name, value] of headers) response.setHeader(name, value)
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify(payload))
          return vercelResponse
        },
      } as unknown as VercelResponse
      const vercelRequest = Object.assign(request, { body }) as VercelRequest
      await downloadHandler(vercelRequest, vercelResponse)
    })
    .catch((error: unknown) => {
      response.statusCode = error instanceof Error && error.message === 'Request terlalu besar.' ? 413 : 400
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Request tidak valid.' }))
    })
}

export default defineConfig(({ mode }) => {
  const env = process.env
  const localEnv = mode === 'development' ? loadEnv(mode, process.cwd(), '') : {}
  if (localEnv.MEDIA_PROVIDER_URL) env.MEDIA_PROVIDER_URL = localEnv.MEDIA_PROVIDER_URL
  if (localEnv.MEDIA_PROVIDER_API_KEY) env.MEDIA_PROVIDER_API_KEY = localEnv.MEDIA_PROVIDER_API_KEY

  return {
    plugins: [
      tailwindcss(),
      { name: 'local-api', configureServer: (server) => { server.middlewares.use(localApiMiddleware) } },
    ],
  }
})