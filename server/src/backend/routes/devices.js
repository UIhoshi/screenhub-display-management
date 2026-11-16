const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

function registerDeviceRoutes(server, options) {
  const { app, installersRoot } = options;

  app.get('/api/installers', (req, res) => {
    res.json(server.getInstallerCatalog());
  });

  app.post('/api/installers/upload', server.installerUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'file is required' });
        return;
      }

      const originalExt = path.extname(req.file.originalname).toLowerCase();
      if (originalExt !== '.msi') {
        await fs.promises.rm(req.file.path, { force: true });
        res.status(400).json({ success: false, error: 'Only .msi files are allowed' });
        return;
      }

      const fileHash = server.createMd5Hash(req.file.path);
      const safeFileName = `${fileHash}.msi`;
      const targetPath = path.join(installersRoot, safeFileName);

      try {
        await fs.promises.access(targetPath, fs.constants.F_OK);
      } catch (_error) {
        await fs.promises.copyFile(req.file.path, targetPath);
      }
      await fs.promises.rm(req.file.path, { force: true });
      res.json({ success: true, installer: server.getInstallerCatalog().find((item) => item.fileName === safeFileName) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
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
    server.logEvent('device_pair_approved', {
      category: 'pairing',
      machineId,
    });
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
    server.revokeClientSession(machineId, 'device-unbound');
    server.discoveredDevices.set(machineId, {
      ...device,
      approved: false,
      connected: false,
      pairingCode: server.generatePairingCode(),
    });
    server.logEvent('device_pair_unbound', {
      category: 'pairing',
      machineId,
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
    server.logEvent('device_command_requested', {
      category: 'command',
      machineId,
      command,
    });
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
