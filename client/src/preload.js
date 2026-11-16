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
  exportDiagnostics: () => ipcRenderer.invoke('player:export-diagnostics'),
  openDiagnosticsFolder: () => ipcRenderer.invoke('player:open-diagnostics-folder'),
  notifyReady: () => ipcRenderer.send('player:ready'),
  getConnectionSettings: () => ipcRenderer.invoke('player:get-connection-settings'),
  testServerConnection: (address) => ipcRenderer.invoke('player:test-server-connection', address),
  setManualServerAddress: (address) => ipcRenderer.invoke('player:set-manual-server-address', address),
  enableAutoDiscovery: () => ipcRenderer.invoke('player:enable-auto-discovery'),
});
