const WebSocket = require('ws');
const { isValidToken } = require('../utils/auth');

function registerSystemRoutes(server, options) {
  const {
    app,
    httpPort,
    wsPort,
    udpPort,
  } = options;

  function handleClientHello(req, res) {
    const body = req.body || {};
    const machineId = String(req.query.machineId || body.machineId || '').trim();
    const clientIp = String(req.query.clientIp || body.clientIp || req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const previous = machineId ? server.discoveredDevices.get(machineId) || {} : {};
    const settings = machineId && typeof server.getDeviceSettings === 'function' ? server.getDeviceSettings(machineId) : {};
    const approved = machineId ? server.approvedDevices.has(machineId) : false;
    const pairingCode = machineId && !approved ? previous.pairingCode || server.generatePairingCode() : null;
    const serverIp = clientIp ? server.resolveServerIpForClient(clientIp) : server.getPreferredServerIp();

    if (machineId) {
      server.discoveredDevices.set(machineId, {
        ...previous,
        ...settings,
        machineId,
        deviceName: String(req.query.deviceName || body.deviceName || previous.deviceName || machineId),
        platform: String(req.query.platform || body.platform || previous.platform || ''),
        ip: clientIp || previous.ip || null,
        serverIp,
        approved,
        pairingCode,
        connected: server.clients.has(machineId),
        lastSeen: new Date().toISOString(),
      });
    }

    res.json({
      type: 'SERVER_HELLO',
      serverIp,
      httpPort,
      wsPort,
      udpPort,
      approved,
      pairingCode,
      serverTime: new Date().toISOString(),
    });
  }

  app.get('/api/client/hello', handleClientHello);
  app.post('/api/client/hello', handleClientHello);

  app.get('/api/client/playlist', (req, res) => {
    res.json(server.getResolvedPlaylist(req.query.machineId));
  });

  app.use('/api', (req, res, next) => {
    const token = req.get('x-admin-token');
    if (!isValidToken(token, server.adminToken)) {
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

  app.get('/api/diagnostics', (req, res) => {
    res.json(server.buildDiagnosticsSnapshot(req.query.machineId || null));
  });

  app.post('/api/diagnostics/export', async (req, res) => {
    try {
      const result = await server.exportDiagnosticsPackage(req.body?.machineId || null);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/diagnostics/open-latest', async (_req, res) => {
    try {
      const result = await server.openLatestDiagnosticsExportFolder();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
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
