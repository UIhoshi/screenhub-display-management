const WebSocket = require('ws');

function registerDeviceRoutes(server, options) {
  const { app } = options;

  app.get('/api/installers', (req, res) => {
    res.json(server.getInstallerCatalog());
  });

  app.get('/api/client-release/latest', (req, res) => {
    const release = server.getLatestClientRelease();
    if (!release) {
      res.status(404).json({ success: false, error: 'No client release found' });
      return;
    }
    res.json(release);
  });

  app.post('/api/pair/approve', (req, res) => {
    const { machineId, pairingCode } = req.body || {};
    if (!machineId || !server.discoveredDevices.has(machineId)) {
      res.status(404).json({ success: false, error: 'Unknown device' });
      return;
    }

    const device = server.discoveredDevices.get(machineId);
    if (!pairingCode || String(pairingCode) !== String(device.pairingCode || '')) {
      res.status(403).json({ success: false, error: 'Invalid pairing code' });
      return;
    }

    server.approvedDevices.add(machineId);
    server.saveApprovedDevices();
    server.discoveredDevices.set(machineId, { ...device, approved: true, pairingCode: null });
    res.json({ success: true });
  });

  app.post('/api/pair/unbind', (req, res) => {
    const { machineId } = req.body || {};
    if (!machineId || !server.discoveredDevices.has(machineId)) {
      res.status(404).json({ success: false, error: 'Unknown device' });
      return;
    }

    const device = server.discoveredDevices.get(machineId) || { machineId };
    server.approvedDevices.delete(machineId);
    server.saveApprovedDevices();
    server.deleteDeviceSettings(machineId);
    server.clients.delete(machineId);
    server.discoveredDevices.set(machineId, {
      ...device,
      approved: false,
      connected: false,
      pairingCode: server.generatePairingCode(),
    });
    res.json({ success: true });
  });

  app.post('/api/command', (req, res) => {
    const { machineId, command, data } = req.body || {};
    const ws = server.clients.get(machineId);

    if (!machineId || !command) {
      res.status(400).json({ success: false, error: 'machineId and command are required' });
      return;
    }

    if (!server.approvedDevices.has(machineId)) {
      res.status(403).json({ success: false, error: 'Device is not approved' });
      return;
    }

    if (command === 'REMOTE_START_CLIENT') {
      server.remoteStartClient(machineId)
        .then((result) => res.json({ success: true, result }))
        .catch((error) => res.status(500).json({ success: false, error: error.message }));
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      res.status(404).json({ success: false, error: 'Client not connected' });
      return;
    }

    server.sendCommand(ws, command, data || {});
    res.json({ success: true });
  });

  app.post('/api/installers/dispatch', (req, res) => {
    const { machineId, fileName } = req.body || {};
    const ws = server.clients.get(machineId);
    if (!machineId || !fileName) {
      res.status(400).json({ success: false, error: 'machineId and fileName are required' });
      return;
    }
    if (!server.approvedDevices.has(machineId)) {
      res.status(403).json({ success: false, error: 'Device is not approved' });
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      res.status(404).json({ success: false, error: 'Client not connected' });
      return;
    }
    const installer = server.getInstallerCatalog(machineId).find((item) => item.fileName === fileName);
    if (!installer) {
      res.status(404).json({ success: false, error: 'Installer not found' });
      return;
    }
    server.sendCommand(ws, 'INSTALL_PACKAGE', installer);
    res.json({ success: true, installer });
  });

  app.post('/api/client-release/dispatch', (req, res) => {
    const { machineId } = req.body || {};
    const ws = server.clients.get(machineId);
    const release = server.getLatestClientRelease(machineId);
    if (!machineId) {
      res.status(400).json({ success: false, error: 'machineId is required' });
      return;
    }
    if (!release) {
      res.status(404).json({ success: false, error: 'No client release found' });
      return;
    }
    if (!server.approvedDevices.has(machineId)) {
      res.status(403).json({ success: false, error: 'Device is not approved' });
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      res.status(404).json({ success: false, error: 'Client not connected' });
      return;
    }
    server.sendCommand(ws, 'APPLY_CLIENT_UPDATE', release);
    res.json({ success: true, release });
  });
}

module.exports = registerDeviceRoutes;
