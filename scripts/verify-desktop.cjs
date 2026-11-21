'use strict'

const http = require('node:http')
const path = require('node:path')
const { ServiceManager } = require('../desktop/services.cjs')

const projectRoot = path.resolve(__dirname, '..')
const config = require(path.join(projectRoot, 'kinosave.config.json'))
const apiKey = process.env.KINOSAVE_API_KEY || 'kinosave-verifikasi-sementara'

function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const request = http.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
      },
      (response) => {
        let raw = ''
        response.on('data', (chunk) => { raw += chunk })
        response.on('end', () => resolve({ status: response.statusCode, body: raw }))
      },
    )
    request.on('error', reject)
    request.end(payload)
  })
}

async function main() {
  const manager = new ServiceManager({
    projectRoot,
    config,
    log: (line) => console.log(`  [log] ${line}`),
    onStatus: (status) => console.log(`  [status] ${JSON.stringify(status)}`),
  })

  console.log('Mulai services...')
  await manager.start()
  console.log('Services running.')

  const base = `http://127.0.0.1:${config.servicePort}`
  const testUrl = 'https://www.youtube.com/watch?v=BaW_jenozKc'

  const withKey = await post(`${base}/api/info`, { url: testUrl }, { Authorization: `Api-Key ${apiKey}` })
  console.log(`api/info dengan key    -> ${withKey.status} ${withKey.body.slice(0, 200)}`)

  const withoutKey = await post(`${base}/api/info`, { url: testUrl })
  console.log(`api/info tanpa key     -> ${withoutKey.status} ${withoutKey.body.slice(0, 120)}`)

  const download = await post(`${base}/api/download`, { url: testUrl, quality: '360', format: 'audio' }, { Authorization: `Api-Key ${apiKey}` })
  console.log(`api/download dengan key -> ${download.status} ${download.body.slice(0, 200)}`)

  const connection = await manager.checkConnection()
  console.log(`tes koneksi Vercel     -> ${connection.ok ? 'OK' : 'GAGAL'}: ${connection.message}`)

  const serverPid = manager.server.pid
  const tunnelPid = manager.tunnel.pid
  console.log(`PIDs: server=${serverPid} tunnel=${tunnelPid}`)

  manager.stop()
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const alive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  console.log(`server masih hidup? ${alive(serverPid)}`)
  console.log(`tunnel masih hidup? ${alive(tunnelPid)}`)
  console.log('Selesai.')
}

main().catch((error) => {
  console.error('GAGAL:', error.message)
  process.exit(1)
})
