'use strict'

const statusText = {
  stopped: 'Mati',
  starting: 'Start',
  running: 'Siaga',
  error: 'Gagal',
}

const serverPill = document.getElementById('server-pill')
const tunnelPill = document.getElementById('tunnel-pill')
const errorBox = document.getElementById('error')
const toggleButton = document.getElementById('toggle')
const logBox = document.getElementById('log')

function setPill(element, value) {
  element.textContent = statusText[value] || value
  element.className = `pill ${value}`
}

function render(status) {
  setPill(serverPill, status.server)
  setPill(tunnelPill, status.tunnel)
  const running = status.server === 'running' || status.tunnel === 'running' || status.server === 'starting'
  toggleButton.textContent = running ? 'Jeda' : 'Mulai'
  toggleButton.disabled = status.server === 'starting' || status.tunnel === 'starting'
  if (status.error) {
    errorBox.textContent = status.error
    errorBox.hidden = false
  } else {
    errorBox.hidden = true
  }
}

function appendLog(line) {
  logBox.textContent += `${line}\n`
  logBox.scrollTop = logBox.scrollHeight
}

window.kinosave.onStatus(render)
window.kinosave.onLog(appendLog)

toggleButton.addEventListener('click', async () => {
  const status = await window.kinosave.status()
  const running = status.server === 'running' || status.tunnel === 'running' || status.server === 'starting'
  if (running) {
    await window.kinosave.stop()
    return
  }
  toggleButton.disabled = true
  const result = await window.kinosave.start()
  toggleButton.disabled = false
  if (!result.ok) {
    errorBox.textContent = result.error
    errorBox.hidden = false
  }
})

document.getElementById('open-website').addEventListener('click', () => window.kinosave.openWebsite())
document.getElementById('quit').addEventListener('click', () => window.kinosave.quit())

document.getElementById('test').addEventListener('click', async () => {
  const testButton = document.getElementById('test')
  testButton.disabled = true
  appendLog('Tes koneksi ke website Vercel...')
  const result = await window.kinosave.test()
  appendLog(result.message)
  testButton.disabled = false
})

window.kinosave.status().then(render)
