const WebSocket = require('ws');
const log = require('electron-log');
const { isValidToken } = require('./utils/auth');

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
        server.logEvent('ws_heartbeat_timeout', {
          category: 'ws',
          machineId,
          timeoutMs: WS_PING_TIMEOUT_MS,
        }, 'warn');
        try {
          ws.terminate();
        } catch (error) {
          server.logEvent('ws_terminate_failed', {
            category: 'ws',
            machineId,
            message: error.message,
          }, 'warn');
        }
        continue;
      }

      try {
        ws.ping();
      } catch (error) {
        server.logEvent('ws_ping_failed', {
          category: 'ws',
          machineId,
          message: error.message,
        }, 'warn');
      }
    }
  }, WS_PING_INTERVAL_MS);

  server.wss.on('connection', (ws) => {
    let currentMachineId = null;
    let isAdminClient = false;
    ws.__adLastPongAt = Date.now();
    server.logEvent('ws_connection_opened', { category: 'ws' });

    ws.on('pong', () => {
      ws.__adLastPongAt = Date.now();
    });

    ws.on('message', (message) => {
      ws.__adLastPongAt = Date.now();
      try {
        const payload = JSON.parse(message.toString());

        if (payload.type === 'REGISTER_ADMIN') {
          if (!isValidToken(payload.adminToken, server.adminToken)) {
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
          server.logEvent('ws_client_registered', {
            category: 'ws',
            machineId,
            approved,
            discoveryServerIp: (server.discoveredDevices.get(machineId) || {}).serverIp || null,
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

        if (!server.approvedDevices.has(currentMachineId)) {
          server.logEvent('ws_client_rejected_after_unbind', {
            category: 'ws',
            machineId: currentMachineId,
            payloadType: payload.type || null,
          }, 'warn');
          try {
            ws.send(JSON.stringify({ type: 'AUTH_REJECTED' }));
          } catch (_error) {
            // Best-effort rejection notice.
          }
          ws.close(4001, 'device-unbound');
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
          if (status.ws || status.discovery || status.auth || status.maintenance) {
            server.logEvent('client_status_transition', {
              category: 'client-status',
              machineId: currentMachineId,
              ws: status.ws || null,
              discovery: status.discovery || null,
              auth: status.auth || null,
              maintenance: status.maintenance || null,
              mediaLibraryPath: status.mediaLibraryPath || null,
            });
          }
          return;
        }

        if (payload.type === 'INSTALL_STATUS') {
          server.logEvent('client_install_status', {
            category: 'install',
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
          server.logEvent('client_download_status', {
            category: 'download',
            machineId: currentMachineId,
            syncId: status.syncId || null,
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
          server.logEvent('client_player_error', {
            category: 'playback',
            machineId: currentMachineId,
            syncId: payload.syncId || null,
            playbackItem: payload.originalSrc || payload.src || null,
            errorType: payload.type || null,
            message: payload.message || null,
          }, 'warn');
          server.updateDevice(currentMachineId, {
            lastError: payload.message,
            errorUpdatedAt: new Date().toISOString(),
          });
          return;
        }

        if (payload.type === 'PLAYER_LOG') {
          server.logEvent('client_player_event', {
            category: 'playback',
            machineId: currentMachineId,
            syncId: payload.syncId || null,
            eventType: payload.eventType || null,
            playbackItem: payload.payload?.originalSrc || payload.payload?.src || null,
            payload: payload.payload || {},
          });
          server.updateDevice(currentMachineId, {
            lastPlayerEvent: payload.eventType || 'PLAYER_LOG',
            playerEventUpdatedAt: new Date().toISOString(),
          });
          return;
        }

        server.logEvent('ws_message_received', {
          category: 'ws',
          machineId: currentMachineId,
          payloadType: payload.type || null,
        });
      } catch (error) {
        log.error('Failed to process WS message', error);
      }
    });

    ws.on('close', () => {
      server.logEvent('ws_connection_closed', {
        category: 'ws',
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
