'use strict'

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { ServiceManager } = require('./services.cjs')

const projectRoot = path.resolve(__dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'kinosave.config.json'), 'utf8'))

let mainWindow = null
let manager = null

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 640,
    resizable: false,
    backgroundColor: '#111111',
    title: 'KinoSave',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  manager = new ServiceManager({
    projectRoot,
    config,
    log: (line) => {
      console.log(line)
      send('log', line)
    },
    onStatus: (status) => send('status', status),
  })

  createWindow()

  ipcMain.handle('services:start', async () => {
    try {
      await manager.start()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('services:stop', () => {
    manager.stop()
    return { ok: true }
  })

  ipcMain.handle('services:status', () => manager.status)

  ipcMain.handle('services:test', () => manager.checkConnection())

  ipcMain.handle('app:open-website', () => {
    shell.openExternal(config.websiteUrl)
    return { ok: true }
  })

  ipcMain.handle('app:quit', () => {
    app.quit()
    return { ok: true }
  })

  manager.start().catch(() => {})
})

app.on('before-quit', () => {
  if (manager) manager.stop()
})

app.on('window-all-closed', () => {
  app.quit()
})
