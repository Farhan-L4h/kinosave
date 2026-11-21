'use strict'

const path = require('node:path')
const { ServiceManager } = require('../desktop/services.cjs')

const projectRoot = path.resolve(__dirname, '..')
const config = require(path.join(projectRoot, 'kinosave.config.json'))

const manager = new ServiceManager({
  projectRoot,
  config,
  log: (line) => console.log(line),
  onStatus: (status) => console.log(`[status] ${JSON.stringify(status)}`),
})

manager.start().then(() => {
  console.log('READY')
}).catch((error) => {
  console.error('GAGAL:', error.message)
  process.exit(1)
})

process.on('SIGINT', () => {
  manager.stop()
  process.exit(0)
})
