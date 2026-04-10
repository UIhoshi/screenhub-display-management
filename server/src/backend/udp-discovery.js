const log = require('electron-log');

function registerUdpDiscovery(server, options) {
  const { httpPort, wsPort } = options;

  server.udpSocket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type !== 'DISCOVERY' || !data.machineId) {
        return;
      }

      const approved = server.approvedDevices.has(data.machineId);
      const previous = server.discoveredDevices.get(data.machineId) || {};
      const settings = server.getDeviceSettings(data.machineId);
      const pairingCode = approved ? null : previous.pairingCode || server.generatePairingCode();
      const serverIp = server.resolveServerIpForClient(rinfo.address);
      server.discoveredDevices.set(data.machineId, {
        ...previous,
        ...settings,
        machineId: data.machineId,
        deviceName: data.deviceName || previous.deviceName,
        platform: data.platform || previous.platform,
        ip: rinfo.address,
        serverIp,
        approved,
        pairingCode,
        connected: server.clients.has(data.machineId),
        lastSeen: new Date().toISOString(),
      });
      log.info('Discovery request handled', {
        machineId: data.machineId,
        clientIp: rinfo.address,
        serverIp,
      });

      server.udpSocket.send(
        JSON.stringify({
          type: 'SERVER_ACK',
          serverIp,
          wsPort,
          httpPort,
          pairingRequired: true,
          approved,
          pairingCode,
        }),
        rinfo.port,
        rinfo.address
      );
    } catch (error) {
      log.error('UDP parse error', error);
    }
  });

  server.udpSocket.on('error', (error) => {
    log.error('UDP socket error', error);
  });
}

module.exports = registerUdpDiscovery;
