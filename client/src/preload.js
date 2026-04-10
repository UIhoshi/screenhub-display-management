const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('playerAPI', {
  onPlaylist: (callback) => ipcRenderer.on('playlist:update', (_event, payload) => callback(payload)),
  onStatus: (callback) => ipcRenderer.on('player:status', (_event, payload) => callback(payload)),
  logEvent: (event) => ipcRenderer.send('player:log', event),
  reportError: (error) => ipcRenderer.send('player:error', error),
  quitApp: () => ipcRenderer.send('player:quit'),
  chooseMediaFolder: () => ipcRenderer.invoke('player:choose-media-folder'),
  readTextContent: (src) => ipcRenderer.invoke('player:read-text-content', src),
  listMediaFolder: (relativePath) => ipcRenderer.invoke('player:list-media-folder', relativePath),
  notifyReady: () => ipcRenderer.send('player:ready'),
});
