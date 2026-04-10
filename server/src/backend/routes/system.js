const WebSocket = require('ws');

function registerSystemRoutes(server, options) {
  const {
    app,
    adminToken,
    httpPort,
    wsPort,
    udpPort,
  } = options;
  app.get('/api/client/playlist', (req, res) => {
    res.json(server.getResolvedPlaylist(req.query.machineId));
  });

  app.use('/api', (req, res, next) => {
    const token = req.get('x-admin-token');
    if (String(token || '').trim() !== String(adminToken || '').trim()) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    next();
  });

  app.get('/api/status', (req, res) => {
    res.json({
      httpPort,
      wsPort,
      udpPort,
      serverIp: server.getPreferredServerIp(),
      approvedDevices: Array.from(server.approvedDevices),
      pairingKeyHint: `${server.pairingKey.slice(0, 4)}***`,
      authRequired: true,
    });
  });

  app.get('/api/devices', (req, res) => {
    res.json(Array.from(server.discoveredDevices.values()));
  });

  app.post('/api/device-settings', (req, res) => {
    const { machineId, mediaLibraryPath } = req.body || {};
    if (!machineId || !server.discoveredDevices.has(machineId)) {
      res.status(404).json({ success: false, error: 'Unknown device' });
      return;
    }

    const normalizedPath = String(mediaLibraryPath || '').trim();
    if (!normalizedPath) {
      res.status(400).json({ success: false, error: 'mediaLibraryPath is required' });
      return;
    }

    const settings = server.updateDeviceSettings(machineId, { mediaLibraryPath: normalizedPath });
    server.updateDevice(machineId, { mediaLibraryPath: normalizedPath });
    const ws = server.clients.get(machineId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      server.sendCommand(ws, 'SET_MEDIA_LIBRARY_DIR', { path: normalizedPath });
    }
    res.json({ success: true, settings });
  });
}

module.exports = registerSystemRoutes;
