const WebSocket = require('ws');
const log = require('electron-log');
const { createHash } = require('crypto');

const WS_PING_INTERVAL_MS = Number(process.env.AD_WS_PING_INTERVAL_MS || 15000);
const WS_PING_TIMEOUT_MS = Number(process.env.AD_WS_PING_TIMEOUT_MS || 30000);

function registerWebSocketGateway(server) {
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [machineId, ws] of server.clients.entries()) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      const lastPongAt = Number(ws.__adLastPongAt || 0);
      if (lastPongAt && now - lastPongAt > WS_PING_TIMEOUT_MS) {
        log.warn('WebSocket heartbeat timed out', {
          machineId,
          timeoutMs: WS_PING_TIMEOUT_MS,
        });
        try {
          ws.terminate();
        } catch (error) {
          log.warn('Failed to terminate stale WebSocket client', {
            machineId,
            message: error.message,
          });
        }
        continue;
      }

      try {
        ws.ping();
      } catch (error) {
        log.warn('Failed to ping WebSocket client', {
          machineId,
          message: error.message,
        });
      }
    }
  }, WS_PING_INTERVAL_MS);

  server.wss.on('connection', (ws) => {
    let currentMachineId = null;
    let isAdminClient = false;
    ws.__adLastPongAt = Date.now();
    log.info('WebSocket connection opened');

    ws.on('pong', () => {
      ws.__adLastPongAt = Date.now();
    });

    ws.on('message', (message) => {
      ws.__adLastPongAt = Date.now();
      try {
        const payload = JSON.parse(message.toString());

        if (payload.type === 'REGISTER_ADMIN') {
          const expectedTokenHash = createHash('sha256').update(String(process.env.AD_ADMIN_TOKEN || '')).digest('hex');
          const candidateHash = createHash('sha256').update(String(payload.adminToken || '')).digest('hex');
          if (!payload.adminToken || candidateHash !== expectedTokenHash) {
            ws.send(JSON.stringify({ type: 'ADMIN_AUTH_REJECTED' }));
            ws.close();
            return;
          }
          isAdminClient = true;
          server.adminClients.add(ws);
          ws.send(JSON.stringify({ type: 'ADMIN_AUTH_OK', serverTime: new Date().toISOString() }));
          return;
        }

        if (payload.type === 'REGISTER') {
          const { machineId, pairingKey, fingerprint } = payload;
          const approved = server.approvedDevices.has(machineId);
          const expectedFingerprint = server.createFingerprint(machineId);

          if (!machineId || pairingKey !== server.pairingKey || fingerprint !== expectedFingerprint || !approved) {
            ws.send(JSON.stringify({ type: 'AUTH_REJECTED' }));
            ws.close();
            return;
          }

          currentMachineId = machineId;
          server.clients.set(machineId, ws);
          ws.__adLastPongAt = Date.now();
          log.info('Client registered via WebSocket', {
            machineId,
            approved,
          });
          server.updateDevice(machineId, {
            machineId,
            approved: true,
            connected: true,
            lastSeen: new Date().toISOString(),
          });

          ws.send(JSON.stringify({
            type: 'AUTH_OK',
            serverTime: new Date().toISOString(),
          }));
          return;
        }

        if (!currentMachineId) {
          if (!isAdminClient) {
            ws.close();
          }
          return;
        }

        if (payload.type === 'HEARTBEAT') {
          const status = payload.status || {};
          if (status.mediaLibraryPath) {
            server.updateDeviceSettings(currentMachineId, {
              mediaLibraryPath: status.mediaLibraryPath,
            });
          }
          server.updateDevice(currentMachineId, {
            connected: true,
            lastSeen: new Date().toISOString(),
            ...status,
            downloadStatus: {
              ...((server.discoveredDevices.get(currentMachineId) || {}).downloadStatus || {}),
              ...(status.downloadStatus || {}),
            },
          });
          server.broadcastToAdmin({
            type: 'DEVICE_PATCH',
            machineId: currentMachineId,
            patch: status,
          });
          return;
        }

        if (payload.type === 'INSTALL_STATUS') {
          log.info('Install status received', {
            machineId: currentMachineId,
            status: payload.status,
            message: payload.message,
          });
          server.updateDevice(currentMachineId, {
            installStatus: payload.status,
            installMessage: payload.message,
            installUpdatedAt: new Date().toISOString(),
          });
          return;
        }

        if (payload.type === 'DOWNLOAD_STATUS') {
          const status = payload.status || {};
          log.info('Download status received', {
            machineId: currentMachineId,
            scope: status.scope || null,
            state: status.state || null,
            fileName: status.fileName || null,
            percent: status.percent ?? null,
          });
          server.updateDevice(currentMachineId, {
            downloadStatus: {
              ...((server.discoveredDevices.get(currentMachineId) || {}).downloadStatus || {}),
              [status.scope || 'media']: {
                ...status,
                updatedAt: new Date().toISOString(),
              },
            },
          });
          server.broadcastToAdmin({
            type: 'DEVICE_PATCH',
            machineId: currentMachineId,
            patch: {
              downloadStatus: {
                [status.scope || 'media']: {
                  ...status,
                  updatedAt: new Date().toISOString(),
                },
              },
            },
          });
          return;
        }

        if (payload.type === 'ENV_REPORT') {
          const report = payload.report || {};
          server.updateDevice(currentMachineId, {
            envReports: {
              ...((server.discoveredDevices.get(currentMachineId) || {}).envReports || {}),
              [report.softwareName || 'unknown']: {
                ...report,
                updatedAt: new Date().toISOString(),
              },
            },
          });
          server.handleEnvironmentReport(currentMachineId, report);
          return;
        }

        if (payload.type === 'SCREENSHOT_DATA') {
          const screenshotUrl = server.persistScreenshot(currentMachineId, payload.data);
          server.updateDevice(currentMachineId, {
            lastScreenshotUrl: screenshotUrl,
            screenshotUpdatedAt: payload.timestamp,
          });
          return;
        }

        if (payload.type === 'PLAYER_ERROR') {
          log.warn(`Player error from ${currentMachineId}`, payload);
          server.updateDevice(currentMachineId, {
            lastError: payload.message,
            errorUpdatedAt: new Date().toISOString(),
          });
          return;
        }

        if (payload.type === 'PLAYER_LOG') {
          log.info(`Player event from ${currentMachineId}`, {
            eventType: payload.eventType || null,
            payload: payload.payload || {},
          });
          server.updateDevice(currentMachineId, {
            lastPlayerEvent: payload.eventType || 'PLAYER_LOG',
            playerEventUpdatedAt: new Date().toISOString(),
          });
          return;
        }

        log.info(`WS message from ${currentMachineId}`, payload);
      } catch (error) {
        log.error('Failed to process WS message', error);
      }
    });

    ws.on('close', () => {
      log.info('WebSocket connection closed', {
        machineId: currentMachineId,
      });
      if (isAdminClient) {
        server.adminClients.delete(ws);
      }
      if (!currentMachineId) {
        return;
      }

      server.clients.delete(currentMachineId);
      server.updateDevice(currentMachineId, {
        connected: false,
        lastSeen: new Date().toISOString(),
      });
    });
  });

  return () => clearInterval(heartbeatTimer);
}

module.exports = registerWebSocketGateway;
