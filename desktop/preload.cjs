'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kinosave', {
  start: () => ipcRenderer.invoke('services:start'),
  stop: () => ipcRenderer.invoke('services:stop'),
  status: () => ipcRenderer.invoke('services:status'),
  test: () => ipcRenderer.invoke('services:test'),
  openWebsite: () => ipcRenderer.invoke('app:open-website'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onStatus: (callback) => ipcRenderer.on('status', (_event, status) => callback(status)),
  onLog: (callback) => ipcRenderer.on('log', (_event, line) => callback(line)),
})
