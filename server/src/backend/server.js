const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const dgram = require('dgram');
const os = require('os');
const { pipeline } = require('stream/promises');
const { execFile } = require('child_process');
const { app } = require('electron');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const WebSocket = require('ws');
const log = require('electron-log');
const networkUtils = require('./utils/network');
const registerSystemRoutes = require('./routes/system');
const registerAssetRoutes = require('./routes/assets');
const registerPlaylistRoutes = require('./routes/playlist');
const registerDeviceRoutes = require('./routes/devices');
const registerWebSocketGateway = require('./ws-gateway');
const registerUdpDiscovery = require('./udp-discovery');

const HTTP_PORT = Number(process.env.AD_SERVER_HTTP_PORT || 3000);
const WS_PORT = Number(process.env.AD_SERVER_WS_PORT || 3001);
const UDP_PORT = Number(process.env.AD_SERVER_UDP_PORT || 8888);
const STORAGE_ROOT = process.env.AD_STORAGE_DIR
  ? path.resolve(process.env.AD_STORAGE_DIR)
  : app.isPackaged
    ? path.join(app.getPath('userData'), 'storage')
    : path.join(__dirname, '../../storage');
const MEDIA_ROOT = path.join(STORAGE_ROOT, 'media');
const INSTALLERS_ROOT = path.join(STORAGE_ROOT, 'installers');
const RELEASES_ROOT = path.join(STORAGE_ROOT, 'releases', 'client');
const SCREENSHOTS_ROOT = path.join(STORAGE_ROOT, 'screenshots');
const PLAYLIST_PATH = path.join(STORAGE_ROOT, 'playlist.json');
const DEVICE_PLAYLISTS_PATH = path.join(STORAGE_ROOT, 'device-playlists.json');
const APPROVED_DEVICES_PATH = path.join(STORAGE_ROOT, 'approved-devices.json');
const DEVICE_SETTINGS_PATH = path.join(STORAGE_ROOT, 'device-settings.json');
const ADMIN_UI_INDEX_PATH = path.join(__dirname, '../admin-ui/index.html');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const TEXT_EXTENSIONS = new Set(['.txt', '.html', '.htm']);
const CLIENT_PUSH_SHARE_NAME = process.env.AD_CLIENT_PUSH_SHARE_NAME || 'screen';
const CLIENT_PUSH_SUBDIR = process.env.AD_CLIENT_PUSH_SUBDIR || path.join('client', 'media-staging');
const REMOTE_START_TASK_NAME = process.env.AD_REMOTE_START_TASK_NAME || 'AdvertisingScreenClient';
const DIAGNOSTICS_ROOT = path.join(STORAGE_ROOT, 'diagnostics');
const DIAGNOSTIC_EXPORT_RETENTION_COUNT = Number(process.env.AD_DIAGNOSTIC_EXPORT_RETENTION_COUNT || 10);
const AUTO_INSTALL_COMPONENTS = [
  {
    softwareName: 'VLC',
    installerHints: ['vlc'],
  },
];

function getRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value || /^REPLACE_/i.test(value) || /^CHANGE_ME/i.test(value)) {
    throw new Error(`${name} must be configured before starting the server`);
  }
  return value;
}

class AdServer {
  constructor(options = {}) {
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.wss = new WebSocket.Server({ port: WS_PORT });
    this.udpSocket = dgram.createSocket('udp4');
    this.clients = new Map();
    this.adminClients = new Set();
    this.discoveredDevices = new Map();
    this.approvedDevices = new Set();
    this.pairingKey = getRequiredEnv('AD_PAIRING_KEY');
    this.adminToken = getRequiredEnv('AD_ADMIN_TOKEN');
    this.remoteStartUser = String(process.env.AD_REMOTE_START_USER || '').trim();
    this.remoteStartPassword = String(process.env.AD_REMOTE_START_PASSWORD || '').trim();
    this.assetUpload = multer({ dest: path.join(STORAGE_ROOT, '_uploads_assets') });
    this.installerUpload = multer({ dest: path.join(STORAGE_ROOT, '_uploads_installers') });
    this.stopWebSocketGateway = null;
    this.logDir = options.logDir || process.env.AD_ACTIVE_SERVER_LOG_DIR || null;
    this.lastDiagnosticsWriteAt = 0;
    this.latestDiagnosticsExport = null;

    this.ensureStorage();
    this.initExpress();
    this.initWebSocket();
    this.initUDP();
  }

  createTraceId(prefix = 'trace') {
    return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  }

  summarizePlaylistForLog(machineId, payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
      machineId: machineId || null,
      syncId: payload.syncId || null,
      mode: payload.mode || 'loop',
      itemCount: items.length,
      items: items.slice(0, 10).map((item) => ({
        type: item?.type || null,
        path: item?.path || item?.fileName || null,
        fileName: item?.fileName || null,
        durationMs: typeof item?.durationMs === 'number' ? item.durationMs : null,
        folderPlayMode: item?.folderPlayMode || null,
      })),
    };
  }

  logEvent(event, details = {}, level = 'info') {
    const logger = typeof log[level] === 'function' ? log[level].bind(log) : log.info.bind(log);
    logger(event, {
      service: 'server',
      event,
      ...details,
    });
  }

  buildDiagnosticsSnapshot(machineId = null) {
    const targetMachineId = machineId ? String(machineId).trim() : null;
    const discoveredDevices = Array.from(this.discoveredDevices.values());
    const filteredDevices = targetMachineId
      ? discoveredDevices.filter((device) => device.machineId === targetMachineId)
      : discoveredDevices;
    const connectedClients = targetMachineId
      ? Array.from(this.clients.keys()).filter((id) => id === targetMachineId)
      : Array.from(this.clients.keys());
    const approvedDevices = targetMachineId
      ? Array.from(this.approvedDevices).filter((id) => id === targetMachineId)
      : Array.from(this.approvedDevices).sort();
    const devicePlaylists = this.loadDevicePlaylists();
    const deviceSettings = this.loadDeviceSettings();
    return {
      generatedAt: new Date().toISOString(),
      machineId: targetMachineId,
      logDir: this.logDir,
      storageRoot: STORAGE_ROOT,
      ports: {
        http: HTTP_PORT,
        ws: WS_PORT,
        udp: UDP_PORT,
      },
      approvedDevices,
      connectedClients,
      discoveredDevices: filteredDevices,
      activePlaylist: this.getResolvedPlaylist(targetMachineId),
      devicePlaylists: targetMachineId
        ? { [targetMachineId]: devicePlaylists[targetMachineId] || null }
        : devicePlaylists,
      deviceSettings: targetMachineId
        ? { [targetMachineId]: deviceSettings[targetMachineId] || null }
        : deviceSettings,
      latestClientRelease: this.getLatestClientRelease(),
      installerCatalog: this.getInstallerCatalog(),
      latestDiagnosticsExport: this.latestDiagnosticsExport,
    };
  }

  writeDiagnosticsSnapshot(reason = 'manual', force = false, machineId = null) {
    const now = Date.now();
    const snapshotFileName = machineId ? `server-diagnostics-${machineId}.json` : 'server-diagnostics.json';
    if (!force && !machineId && now - this.lastDiagnosticsWriteAt < 1000) {
      return path.join(DIAGNOSTICS_ROOT, snapshotFileName);
    }
    const snapshotPath = path.join(DIAGNOSTICS_ROOT, snapshotFileName);
    const payload = {
      reason,
      ...this.buildDiagnosticsSnapshot(machineId),
    };
    fs.writeFileSync(snapshotPath, JSON.stringify(payload, null, 2));
    if (!machineId) {
      this.lastDiagnosticsWriteAt = now;
    }
    return snapshotPath;
  }

  pruneDiagnosticExports() {
    try {
      const entries = fs.readdirSync(DIAGNOSTICS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.startsWith('support-package-') && entry.name.endsWith('.zip'))
        .map((entry) => {
          const fullPath = path.join(DIAGNOSTICS_ROOT, entry.name);
          const stats = fs.statSync(fullPath);
          return { fullPath, mtimeMs: stats.mtimeMs };
        })
        .sort((left, right) => right.mtimeMs - left.mtimeMs);
      for (const stale of entries.slice(Math.max(DIAGNOSTIC_EXPORT_RETENTION_COUNT, 1))) {
        fs.rmSync(stale.fullPath, { force: true });
      }
    } catch (_error) {
      // Best-effort pruning.
    }
  }

  async exportDiagnosticsPackage(machineId = null) {
    const normalizedMachineId = machineId ? String(machineId).trim() : null;
    if (normalizedMachineId && !this.discoveredDevices.has(normalizedMachineId)) {
      throw new Error(`Unknown device: ${normalizedMachineId}`);
    }
    const exportId = this.createTraceId(normalizedMachineId ? `support_${normalizedMachineId}` : 'support');
    const exportRoot = path.join(DIAGNOSTICS_ROOT, exportId);
    const logsTargetDir = path.join(exportRoot, 'logs');
    fs.mkdirSync(logsTargetDir, { recursive: true });

    const snapshotPath = this.writeDiagnosticsSnapshot('export', true, normalizedMachineId);
    fs.copyFileSync(snapshotPath, path.join(exportRoot, normalizedMachineId ? `device-diagnostics-${normalizedMachineId}.json` : 'server-diagnostics.json'));
    if (fs.existsSync(PLAYLIST_PATH)) {
      fs.copyFileSync(PLAYLIST_PATH, path.join(exportRoot, 'playlist.json'));
    }
    if (fs.existsSync(APPROVED_DEVICES_PATH)) {
      fs.copyFileSync(APPROVED_DEVICES_PATH, path.join(exportRoot, 'approved-devices.json'));
    }
    if (fs.existsSync(DEVICE_SETTINGS_PATH)) {
      fs.copyFileSync(DEVICE_SETTINGS_PATH, path.join(exportRoot, 'device-settings.json'));
    }
    if (fs.existsSync(DEVICE_PLAYLISTS_PATH)) {
      fs.copyFileSync(DEVICE_PLAYLISTS_PATH, path.join(exportRoot, 'device-playlists.json'));
    }

    if (this.logDir && fs.existsSync(this.logDir)) {
      for (const entry of fs.readdirSync(this.logDir, { withFileTypes: true })) {
        if (!entry.isFile()) {
          continue;
        }
        const sourcePath = path.join(this.logDir, entry.name);
        if (!entry.name.endsWith('.log') && !entry.name.includes('.log.')) {
          continue;
        }
        fs.copyFileSync(sourcePath, path.join(logsTargetDir, entry.name));
      }
    }

    const zipPath = path.join(DIAGNOSTICS_ROOT, `support-package-${exportId}.zip`);
    await new Promise((resolve, reject) => {
      const script = [
        `$src = '${exportRoot.replace(/'/g, "''")}'`,
        `$dst = '${zipPath.replace(/'/g, "''")}'`,
        "if (Test-Path $dst) { Remove-Item -LiteralPath $dst -Force }",
        "Compress-Archive -LiteralPath (Join-Path $src '*') -DestinationPath $dst -Force",
      ].join('; ');
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    fs.rmSync(exportRoot, { recursive: true, force: true });
    this.pruneDiagnosticExports();
    this.latestDiagnosticsExport = {
      exportId,
      zipPath,
      snapshotPath,
      machineId: normalizedMachineId,
      exportedAt: new Date().toISOString(),
    };
    this.logEvent('diagnostics_package_exported', {
      category: 'diagnostics',
      exportId,
      zipPath,
      machineId: normalizedMachineId,
    });
    return {
      exportId,
      zipPath,
      snapshotPath,
      machineId: normalizedMachineId,
    };
  }

  async openLatestDiagnosticsExportFolder() {
    const latestPath = this.latestDiagnosticsExport?.zipPath;
    if (!latestPath || !fs.existsSync(latestPath)) {
      throw new Error('No diagnostics export package available');
    }
    await new Promise((resolve, reject) => {
      execFile('explorer.exe', ['/select,', latestPath], (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.logEvent('diagnostics_export_folder_opened', {
      category: 'diagnostics',
      zipPath: latestPath,
    });
    return {
      zipPath: latestPath,
    };
  }

  ensureStorage() {
    fs.mkdirSync(MEDIA_ROOT, { recursive: true });
    fs.mkdirSync(INSTALLERS_ROOT, { recursive: true });
    fs.mkdirSync(RELEASES_ROOT, { recursive: true });
    fs.mkdirSync(SCREENSHOTS_ROOT, { recursive: true });
    fs.mkdirSync(DIAGNOSTICS_ROOT, { recursive: true });
    fs.mkdirSync(path.join(STORAGE_ROOT, '_uploads_assets'), { recursive: true });
    fs.mkdirSync(path.join(STORAGE_ROOT, '_uploads_installers'), { recursive: true });
    if (!fs.existsSync(PLAYLIST_PATH)) {
      fs.writeFileSync(
        PLAYLIST_PATH,
        JSON.stringify(
          {
            updatedAt: new Date().toISOString(),
            mode: 'loop',
            items: [
              { type: 'image', path: 'brand-panel.svg', durationMs: 6000 },
              { type: 'image', path: 'ops-panel.svg', durationMs: 6000 },
            ],
          },
          null,
          2
        )
      );
    }

    if (!fs.existsSync(DEVICE_PLAYLISTS_PATH)) {
      fs.writeFileSync(DEVICE_PLAYLISTS_PATH, JSON.stringify({}, null, 2));
    }
    if (!fs.existsSync(APPROVED_DEVICES_PATH)) {
      fs.writeFileSync(APPROVED_DEVICES_PATH, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(DEVICE_SETTINGS_PATH)) {
      fs.writeFileSync(DEVICE_SETTINGS_PATH, JSON.stringify({}, null, 2));
    }
    this.approvedDevices = new Set(this.loadApprovedDevices());
  }

  loadApprovedDevices() {
    try {
      const payload = JSON.parse(fs.readFileSync(APPROVED_DEVICES_PATH, 'utf8'));
      return Array.isArray(payload) ? payload.filter(Boolean) : [];
    } catch (_error) {
      return [];
    }
  }

  saveApprovedDevices() {
    fs.writeFileSync(APPROVED_DEVICES_PATH, JSON.stringify(Array.from(this.approvedDevices).sort(), null, 2));
  }

  loadDeviceSettings() {
    try {
      return JSON.parse(fs.readFileSync(DEVICE_SETTINGS_PATH, 'utf8')) || {};
    } catch (_error) {
      return {};
    }
  }

  saveDeviceSettings(payload) {
    fs.writeFileSync(DEVICE_SETTINGS_PATH, JSON.stringify(payload, null, 2));
  }

  getDeviceSettings(machineId) {
    return this.loadDeviceSettings()[machineId] || {};
  }

  updateDeviceSettings(machineId, patch) {
    const settings = this.loadDeviceSettings();
    settings[machineId] = {
      ...(settings[machineId] || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.saveDeviceSettings(settings);
    return settings[machineId];
  }

  deleteDeviceSettings(machineId) {
    const settings = this.loadDeviceSettings();
    if (settings[machineId]) {
      delete settings[machineId];
      this.saveDeviceSettings(settings);
    }
  }

  initExpress() {
    this.app.set('etag', false);
    this.app.use(cors());
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use('/api', (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      next();
    });
    this.app.use((req, res, next) => {
      const startedAt = Date.now();
      res.on('finish', () => {
        if (!req.path.startsWith('/api')) {
          return;
        }
        log.info('API request completed', {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        });
      });
      next();
    });
    this.app.get(['/', '/index.html'], (_req, res) => {
      try {
        const html = fs.readFileSync(ADMIN_UI_INDEX_PATH, 'utf8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        res.type('html').send(html.replace(/__AD_ADMIN_TOKEN_JSON__/g, JSON.stringify(this.adminToken)));
      } catch (error) {
        res.status(500).send(error.message);
      }
    });
    this.app.use(
      express.static(path.join(__dirname, '../admin-ui'), {
        index: false,
        etag: false,
        lastModified: false,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          res.setHeader('Surrogate-Control', 'no-store');
        },
      })
    );
    this.app.use('/media', express.static(MEDIA_ROOT));
    this.app.use('/installers', express.static(INSTALLERS_ROOT));
    this.app.use('/releases/client', express.static(RELEASES_ROOT));
    this.app.use('/screenshots', express.static(SCREENSHOTS_ROOT));
    registerSystemRoutes(this, {
      app: this.app,
      httpPort: HTTP_PORT,
      wsPort: WS_PORT,
      udpPort: UDP_PORT,
    });
    registerAssetRoutes(this, {
      app: this.app,
      mediaRoot: MEDIA_ROOT,
    });
    registerPlaylistRoutes(this, { app: this.app });
    registerDeviceRoutes(this, {
      app: this.app,
      installersRoot: INSTALLERS_ROOT,
    });
  }

  initWebSocket() {
    this.stopWebSocketGateway = registerWebSocketGateway(this);
  }

  initUDP() {
    registerUdpDiscovery(this, {
      httpPort: HTTP_PORT,
      wsPort: WS_PORT,
    });
  }

  createFingerprint(machineId) {
    return crypto.createHash('sha256').update(`${machineId}:${this.pairingKey}`).digest('hex');
  }

  generatePairingCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  createFileHash(filePath) {
    return this.createHashFromFile(filePath, 'sha256');
  }

  createMd5Hash(filePath) {
    return this.createHashFromFile(filePath, 'md5');
  }

  createHashFromFile(filePath, algorithm) {
    const hash = crypto.createHash(algorithm);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(1024 * 1024);

    try {
      while (true) {
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (bytesRead === 0) {
          break;
        }
        hash.update(buffer.subarray(0, bytesRead));
      }
    } finally {
      fs.closeSync(fd);
    }

    return hash.digest('hex');
  }

  getMediaType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      return 'image';
    }
    if (VIDEO_EXTENSIONS.has(ext)) {
      return 'video';
    }
    if (TEXT_EXTENSIONS.has(ext)) {
      return 'text';
    }
    return 'file';
  }

  sanitizeAssetSegment(segment, fallback = 'item') {
    const safeSegment = String(segment || '')
      .normalize('NFC')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .trim()
      .replace(/[. ]+$/g, '');
    return safeSegment || fallback;
  }

  normalizeAssetDirectory(relativePath) {
    const parts = String(relativePath || '')
      .split(/[\\/]+/)
      .map((segment) => this.sanitizeAssetSegment(segment))
      .filter(Boolean);
    return parts.join('/');
  }

  normalizeAssetRelativePath(relativePath) {
    const parts = String(relativePath || '')
      .split(/[\\/]+/)
      .map((segment, index, all) => this.sanitizeAssetSegment(segment, index === all.length - 1 ? 'asset' : 'folder'))
      .filter(Boolean);
    return parts.join('/');
  }

  buildUniqueAssetPath(directorySegments, fileName) {
    const safeFileName = this.sanitizeAssetSegment(fileName, 'asset');
    const ext = path.extname(safeFileName);
    const baseName = path.basename(safeFileName, ext) || 'asset';
    let suffix = 0;

    while (true) {
      const candidateName = suffix === 0 ? safeFileName : `${baseName}-${suffix + 1}${ext}`;
      const relativePath = [...directorySegments, candidateName].filter(Boolean).join('/');
      if (!fs.existsSync(path.join(MEDIA_ROOT, relativePath))) {
        return relativePath;
      }
      suffix += 1;
    }
  }

  buildAssetStoragePath(originalName, relativePath, baseDir = '') {
    const normalizedBaseDir = this.normalizeAssetDirectory(baseDir);
    const rawRelativePath = String(relativePath || originalName || 'asset');
    const inputSegments = rawRelativePath.split(/[\\/]+/).filter(Boolean);
    const fallbackFileName = path.basename(originalName || 'asset');
    const rawFileName = inputSegments.pop() || fallbackFileName;
    const directorySegments = inputSegments.map((segment) => this.sanitizeAssetSegment(segment, 'folder')).filter(Boolean);
    const sanitizedFileName = this.sanitizeAssetSegment(rawFileName, fallbackFileName || 'asset');
    return this.buildUniqueAssetPath([normalizedBaseDir, ...directorySegments].filter(Boolean), sanitizedFileName);
  }

  normalizeDurationMs(value, mediaType) {
    if (mediaType === 'video') {
      return undefined;
    }

    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return Math.round(numericValue);
    }
    return 5000;
  }

  getServerIpForMachine(machineId) {
    const device = machineId ? this.discoveredDevices.get(machineId) : null;
    return (device && device.serverIp) || this.getPreferredServerIp();
  }

  getLocalIPv4Addresses() {
    return networkUtils.getLocalIPv4Addresses();
  }

  isPrivateLanIp(address) {
    return networkUtils.isPrivateLanIp(address);
  }

  getPreferredServerIp() {
    return networkUtils.getPreferredServerIp();
  }

  getIpv4PrefixScore(left, right) {
    return networkUtils.getIpv4PrefixScore(left, right);
  }

  resolveServerIpForClient(clientIp) {
    return networkUtils.resolveServerIpForClient(clientIp);
  }

  createAbsoluteUrl(machineId, basePath, fileName) {
    const encodedPath = String(fileName || '')
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `http://${this.getServerIpForMachine(machineId)}:${HTTP_PORT}${basePath}/${encodedPath}`;
  }

  remoteStartClient(machineId) {
    const device = this.discoveredDevices.get(machineId);
    if (!device?.ip) {
      return Promise.reject(new Error(`Device IP is unavailable for ${machineId}`));
    }
    if (!this.remoteStartUser || !this.remoteStartPassword) {
      return Promise.reject(new Error('Remote start credentials are not configured on the server'));
    }

    const fallbackToShareTrigger = (reasonMessage) => {
      const triggerPath = this.getClientRemoteStartTriggerPath(machineId);
      if (!triggerPath) {
        throw new Error(reasonMessage || `Client control path is unavailable for ${machineId}`);
      }
      fs.mkdirSync(path.dirname(triggerPath), { recursive: true });
      fs.writeFileSync(triggerPath, JSON.stringify({
        machineId,
        requestedAt: new Date().toISOString(),
        requestedBy: 'server',
        reason: reasonMessage || 'scheduled-task-access-denied',
      }, null, 2));
      log.info('Remote start trigger file written', {
        machineId,
        ip: device.ip,
        triggerPath,
      });
      return {
        machineId,
        ip: device.ip,
        triggerPath,
        mode: 'share-trigger',
      };
    };

    return new Promise((resolve, reject) => {
      const args = [
        '/Run',
        '/S', device.ip,
        '/U', this.remoteStartUser,
        '/P', this.remoteStartPassword,
        '/TN', REMOTE_START_TASK_NAME,
      ];

      execFile('schtasks.exe', args, (error, stdout, stderr) => {
        if (error) {
          const reason = stderr?.trim() || stdout?.trim() || error.message;
          try {
            resolve(fallbackToShareTrigger(reason));
          } catch (fallbackError) {
            log.warn('Remote start fallback failed', {
              machineId,
              ip: device.ip,
              message: fallbackError.message,
            });
            reject(fallbackError);
          }
          return;
        }

        log.info('Remote start client triggered', {
          machineId,
          ip: device.ip,
          taskName: REMOTE_START_TASK_NAME,
        });
        resolve({
          machineId,
          ip: device.ip,
          taskName: REMOTE_START_TASK_NAME,
          output: stdout.trim(),
        });
      });
    });
  }

  getClientPushRoot(machineId) {
    const device = machineId ? this.discoveredDevices.get(machineId) : null;
    if (!device?.ip) {
      return null;
    }
    return `\\\\${device.ip}\\${CLIENT_PUSH_SHARE_NAME}\\${CLIENT_PUSH_SUBDIR.replace(/[\\/]+/g, '\\')}`;
  }

  getClientPushTargetPath(machineId, fileName) {
    const pushRoot = this.getClientPushRoot(machineId);
    if (!pushRoot) {
      return null;
    }
    return path.join(pushRoot, ...this.normalizeAssetRelativePath(fileName || '').split('/'));
  }

  getClientControlRoot(machineId) {
    const device = machineId ? this.discoveredDevices.get(machineId) : null;
    if (!device?.ip) {
      return null;
    }
    return `\\\\${device.ip}\\${CLIENT_PUSH_SHARE_NAME}\\client\\control`;
  }

  getClientRemoteStartTriggerPath(machineId) {
    const controlRoot = this.getClientControlRoot(machineId);
    return controlRoot ? path.join(controlRoot, 'start-request.json') : null;
  }

  getClientPushMetaPath(machineId, fileName) {
    const targetPath = this.getClientPushTargetPath(machineId, fileName);
    return targetPath ? `${targetPath}.meta.json` : null;
  }

  readClientPushMeta(machineId, fileName) {
    const metaPath = this.getClientPushMetaPath(machineId, fileName);
    if (!metaPath || !fs.existsSync(metaPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (_error) {
      return null;
    }
  }

  writeClientPushMeta(machineId, fileName, payload) {
    const metaPath = this.getClientPushMetaPath(machineId, fileName);
    if (!metaPath) {
      return;
    }
    fs.mkdirSync(path.dirname(metaPath), { recursive: true });
    fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2));
  }

  async copyAssetToClient(machineId, fileName, expectedSha256 = null) {
    const normalizedFileName = this.normalizeAssetRelativePath(fileName || '');
    const sourcePath = path.join(MEDIA_ROOT, normalizedFileName);
    const targetPath = this.getClientPushTargetPath(machineId, normalizedFileName);

    if (!targetPath) {
      throw new Error(`Client push path is unavailable for ${machineId}`);
    }
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Asset not found for push: ${normalizedFileName}`);
    }

    const sourceStats = await fs.promises.stat(sourcePath);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    try {
      const targetStats = await fs.promises.stat(targetPath);
      if (targetStats.size === sourceStats.size) {
        if (expectedSha256) {
          this.writeClientPushMeta(machineId, normalizedFileName, {
            fileName: normalizedFileName,
            size: sourceStats.size,
            sha256: expectedSha256,
            updatedAt: new Date().toISOString(),
          });
        }
        const existingMeta = this.readClientPushMeta(machineId, normalizedFileName);
        if (
          existingMeta
          && Number(existingMeta.size || 0) === sourceStats.size
          && (!expectedSha256 || existingMeta.sha256 === expectedSha256)
        ) {
          return { skipped: true, size: sourceStats.size, targetPath };
        }
        if (!expectedSha256 || !existingMeta) {
          return { skipped: true, size: sourceStats.size, targetPath };
        }
        if (this.createFileHash(targetPath) === expectedSha256) {
          this.writeClientPushMeta(machineId, normalizedFileName, {
            fileName: normalizedFileName,
            size: sourceStats.size,
            sha256: expectedSha256,
            updatedAt: new Date().toISOString(),
          });
          return { skipped: true, size: sourceStats.size, targetPath };
        }
      }
    } catch (_error) {
      // target missing, continue with copy
    }

    await pipeline(
      fs.createReadStream(sourcePath, { highWaterMark: 4 * 1024 * 1024 }),
      fs.createWriteStream(targetPath, { highWaterMark: 4 * 1024 * 1024 })
    );
    this.writeClientPushMeta(machineId, normalizedFileName, {
      fileName: normalizedFileName,
      size: sourceStats.size,
      sha256: expectedSha256 || this.createFileHash(sourcePath),
      updatedAt: new Date().toISOString(),
    });
    return { skipped: false, size: sourceStats.size, targetPath };
  }

  async pushPlaylistAssetsToDevice(machineId, playlist) {
    const syncId = playlist?.syncId || this.createTraceId('playlist');
    const folderExpansions = new Map();
    const mediaItems = Array.isArray(playlist?.items)
      ? playlist.items.flatMap((item) => {
        if (!item) {
          return [];
        }
        if (item.type === 'folder' && item.path) {
          const expandedItems = this.getAssetCatalog(item.path)
            .filter((asset) => ['image', 'video', 'text'].includes(asset.type))
            .map((asset) => ({
              ...asset,
              ...(asset.type === 'image' && typeof item.durationMs === 'number'
                ? { durationMs: item.durationMs }
                : {}),
            }));
          folderExpansions.set(item.path, expandedItems);
          return expandedItems;
        }
        if (item.fileName && ['image', 'video', 'text'].includes(item.type)) {
          return [item];
        }
        return [];
      })
      : [];

    if (!mediaItems.length) {
      return playlist;
    }

    const startedAt = new Date().toISOString();
    const totalBytes = mediaItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
    let transferredBytes = 0;
    const startedMs = Date.now();

    try {
      for (const item of mediaItems) {
        const itemStartedMs = Date.now();
        this.logEvent('playlist_asset_push_started', {
          category: 'playlist',
          syncId,
          machineId,
          fileName: item.fileName,
          size: item.size || null,
          targetPath: this.getClientPushTargetPath(machineId, item.fileName),
        });
        this.updateDevice(machineId, {
          downloadStatus: {
            ...((this.discoveredDevices.get(machineId) || {}).downloadStatus || {}),
            push: {
              scope: 'push',
              state: 'downloading',
              fileName: item.fileName,
              percent: totalBytes > 0 ? Number(((transferredBytes / totalBytes) * 100).toFixed(1)) : null,
              downloadedBytes: transferredBytes,
              totalBytes,
              bytesPerSecond: transferredBytes > 0 ? Number((transferredBytes / Math.max((Date.now() - startedMs) / 1000, 0.1)).toFixed(0)) : null,
              startedAt,
              updatedAt: new Date().toISOString(),
              targetPath: this.getClientPushTargetPath(machineId, item.fileName),
              error: null,
            },
          },
        });

        const result = await this.copyAssetToClient(machineId, item.fileName, item.sha256 || null);
        transferredBytes += Number(item.size || result.size || 0);
        this.logEvent('playlist_asset_push_completed', {
          category: 'playlist',
          syncId,
          machineId,
          fileName: item.fileName,
          skipped: result.skipped,
          size: result.size,
          durationMs: Date.now() - itemStartedMs,
          targetPath: result.targetPath,
        });
      }
    } catch (error) {
      this.logEvent('playlist_asset_push_failed', {
        category: 'playlist',
        syncId,
        machineId,
        transferredBytes,
        totalBytes,
        error: error.message,
      }, 'warn');
      this.updateDevice(machineId, {
        downloadStatus: {
          ...((this.discoveredDevices.get(machineId) || {}).downloadStatus || {}),
          push: {
            scope: 'push',
            state: 'failed',
            fileName: mediaItems.find(Boolean)?.fileName || null,
            percent: totalBytes > 0 ? Number(((transferredBytes / totalBytes) * 100).toFixed(1)) : null,
            downloadedBytes: transferredBytes,
            totalBytes,
            bytesPerSecond: null,
            startedAt,
            updatedAt: new Date().toISOString(),
            targetPath: this.getClientPushTargetPath(machineId, mediaItems.find(Boolean)?.fileName || ''),
            error: error.message,
          },
        },
      });
      throw error;
    }

    const copiedItems = new Map(mediaItems.map((item) => [
      item.fileName,
      {
        ...item,
        pushedRelativePath: item.fileName,
        pushMode: 'server-copy',
      },
    ]));

    this.updateDevice(machineId, {
      downloadStatus: {
        ...((this.discoveredDevices.get(machineId) || {}).downloadStatus || {}),
        push: {
          scope: 'push',
          state: 'completed',
          fileName: mediaItems[mediaItems.length - 1].fileName,
          percent: 100,
          downloadedBytes: transferredBytes,
          totalBytes,
          bytesPerSecond: null,
          startedAt,
          updatedAt: new Date().toISOString(),
          targetPath: this.getClientPushTargetPath(machineId, mediaItems[mediaItems.length - 1].fileName),
          skipped: transferredBytes === 0,
          error: null,
        },
      },
    });

    this.logEvent('playlist_asset_push_batch_completed', {
      category: 'playlist',
      syncId,
      machineId,
      assetCount: mediaItems.length,
      transferredBytes,
      totalBytes,
      durationMs: Date.now() - startedMs,
    });

    return {
      ...playlist,
      syncId,
      items: (playlist.items || []).map((item) => {
        if (item?.type === 'folder' && item.path) {
          const expandedItems = folderExpansions.get(item.path) || [];
          return {
            ...item,
            entries: expandedItems.map((asset) => copiedItems.get(asset.fileName) || asset),
          };
        }
        return copiedItems.get(item?.fileName) || item;
      }),
    };
  }

  describeAssetFile(fileName, machineId = null) {
    const filePath = path.join(MEDIA_ROOT, fileName);
    const stats = fs.statSync(filePath);
    return {
      fileName,
      name: path.basename(fileName),
      directory: path.posix.dirname(fileName) === '.' ? '' : path.posix.dirname(fileName),
      type: this.getMediaType(fileName),
      size: stats.size,
      src: this.createAbsoluteUrl(machineId, '/media', fileName),
      md5: this.createMd5Hash(filePath),
      sha256: this.createFileHash(filePath),
    };
  }

  persistScreenshot(machineId, dataUrl) {
    const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
    if (!match) {
      throw new Error('Invalid screenshot payload');
    }

    const fileName = `${machineId}.png`;
    const filePath = path.join(SCREENSHOTS_ROOT, fileName);
    fs.writeFileSync(filePath, Buffer.from(match[1], 'base64'));
    return `http://${this.getPreferredServerIp()}:${HTTP_PORT}/screenshots/${encodeURIComponent(fileName)}`;
  }

  getInstallerCatalog(machineId = null) {
    const files = fs
      .readdirSync(INSTALLERS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.msi')
      .map((entry) => {
        const filePath = path.join(INSTALLERS_ROOT, entry.name);
        const stats = fs.statSync(filePath);
        return {
          fileName: entry.name,
          productName: path.basename(entry.name, path.extname(entry.name)),
          size: stats.size,
          src: this.createAbsoluteUrl(machineId, '/installers', entry.name),
          md5: this.createMd5Hash(filePath),
          sha256: this.createFileHash(filePath),
        };
      });

    return files;
  }

  getLatestClientRelease(machineId = null) {
    const releases = fs
      .readdirSync(RELEASES_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && ['.exe', '.msi'].includes(path.extname(entry.name).toLowerCase()))
      .map((entry) => {
        const filePath = path.join(RELEASES_ROOT, entry.name);
        const stats = fs.statSync(filePath);
        const extension = path.extname(entry.name).toLowerCase();
        return {
          fileName: entry.name,
          version: path.basename(entry.name, extension),
          size: stats.size,
          src: this.createAbsoluteUrl(machineId, '/releases/client', entry.name),
          md5: this.createMd5Hash(filePath),
          sha256: this.createFileHash(filePath),
          kind: extension === '.msi' ? 'msi' : 'exe',
          silentArgs: extension === '.msi' ? ['/quiet', '/qn', '/norestart'] : ['/S'],
        };
      })
      .sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: 'base' }));

    return releases[0] || null;
  }

  getAssetCatalog(relativeDir = '') {
    const normalizedDir = this.normalizeAssetDirectory(relativeDir);
    const sourceDir = path.join(MEDIA_ROOT, normalizedDir);
    if (!fs.existsSync(sourceDir)) {
      return [];
    }

    const walk = (directory, nestedRelativeDir = '') => fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
      .flatMap((entry) => {
        const nextRelativePath = nestedRelativeDir ? `${nestedRelativeDir}/${entry.name}` : entry.name;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          return walk(fullPath, nextRelativePath);
        }
        return this.describeAssetFile(nextRelativePath);
      });

    return walk(sourceDir, normalizedDir);
  }

  getAssetDirectory(relativeDir = '') {
    const normalizedDir = this.normalizeAssetDirectory(relativeDir);
    const targetDir = path.join(MEDIA_ROOT, normalizedDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: [normalizedDir, entry.name].filter(Boolean).join('/'),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => this.describeAssetFile([normalizedDir, entry.name].filter(Boolean).join('/')))
      .sort((left, right) => left.fileName.localeCompare(right.fileName, undefined, { sensitivity: 'base' }));

    const parentDir = normalizedDir.includes('/') ? normalizedDir.split('/').slice(0, -1).join('/') : '';
    return {
      currentDir: normalizedDir,
      parentDir: normalizedDir ? parentDir : null,
      directories,
      files,
    };
  }

  normalizePlaylistDocument(payload, machineId) {
    const allowedModes = new Set(['loop', 'sequence', 'single', 'random']);
    const allowedFolderModes = new Set(['sequence', 'random']);
    const items = Array.isArray(payload.items) ? payload.items : [];
    const normalizedItems = items.map((item) => {
      if (typeof item.path === 'string') {
        const folderPath = this.normalizeAssetDirectory(item.path);
        const absoluteFolderPath = path.join(MEDIA_ROOT, folderPath);
        if (
          item.type === 'folder' ||
          (folderPath && fs.existsSync(absoluteFolderPath) && fs.statSync(absoluteFolderPath).isDirectory())
        ) {
          const durationMs = this.normalizeDurationMs(item.durationMs, 'image');
          return {
            type: 'folder',
            path: folderPath,
            folderPlayMode: allowedFolderModes.has(String(item.folderPlayMode || '').toLowerCase()) ? String(item.folderPlayMode).toLowerCase() : 'sequence',
            ...(typeof durationMs === 'number' ? { durationMs } : {}),
          };
        }

        const fileName = this.normalizeAssetRelativePath(item.path);
        const filePath = path.join(MEDIA_ROOT, fileName);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Unknown asset: ${fileName}`);
        }
        const mediaType = item.type || this.getMediaType(fileName);
        const durationMs = this.normalizeDurationMs(item.durationMs, mediaType);
        return {
          type: mediaType,
          path: fileName,
          ...(typeof durationMs === 'number' ? { durationMs } : {}),
        };
      }

      if (typeof item.src === 'string') {
        return item;
      }

      throw new Error('Each playlist item must include path or src');
    });

    return {
      updatedAt: new Date().toISOString(),
      machineId,
      mode: allowedModes.has(String(payload.mode).toLowerCase()) ? String(payload.mode).toLowerCase() : 'loop',
      items: normalizedItems,
    };
  }

  normalizePlaylistItem(item, machineId = null) {
    if (typeof item.src === 'string') {
      return machineId
        ? {
            ...item,
            pushedRelativePath: item.pushedRelativePath || item.fileName || item.path || null,
            pushMode: item.pushMode || 'server-copy',
          }
        : item;
    }

    if (item.type === 'folder') {
      const folderPath = this.normalizeAssetDirectory(item.path || '');
      const absoluteFolderPath = path.join(MEDIA_ROOT, folderPath);
      if (!fs.existsSync(absoluteFolderPath) || !fs.statSync(absoluteFolderPath).isDirectory()) {
        throw new Error(`Folder not found: ${folderPath}`);
      }
      return {
        type: 'folder',
        path: folderPath,
        folderPlayMode: String(item.folderPlayMode || 'sequence').toLowerCase() === 'random' ? 'random' : 'sequence',
        ...(typeof item.durationMs === 'number' ? { durationMs: item.durationMs } : {}),
      };
    }

    const fileName = this.normalizeAssetRelativePath(item.path || '');
    const filePath = path.join(MEDIA_ROOT, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Media file not found: ${fileName}`);
    }
    const stats = fs.statSync(filePath);
    const mediaType = item.type || this.getMediaType(fileName);
    const durationMs = this.normalizeDurationMs(item.durationMs, mediaType);

    return {
      type: mediaType,
      ...(typeof durationMs === 'number' ? { durationMs } : {}),
      fileName,
      size: stats.size,
      src: this.createAbsoluteUrl(machineId, '/media', fileName),
      md5: this.createMd5Hash(filePath),
      sha256: this.createFileHash(filePath),
      ...(machineId ? { pushedRelativePath: fileName, pushMode: 'server-copy' } : {}),
    };
  }

  loadDevicePlaylists() {
    return JSON.parse(fs.readFileSync(DEVICE_PLAYLISTS_PATH, 'utf8'));
  }

  saveDevicePlaylists(payload) {
    fs.writeFileSync(DEVICE_PLAYLISTS_PATH, JSON.stringify(payload, null, 2));
  }

  getResolvedPlaylist(machineId) {
    const globalPlaylist = JSON.parse(fs.readFileSync(PLAYLIST_PATH, 'utf8'));
    const devicePlaylists = this.loadDevicePlaylists();
    const selected = machineId && devicePlaylists[machineId] ? devicePlaylists[machineId] : globalPlaylist;

    return {
      machineId: machineId || null,
      updatedAt: selected.updatedAt || new Date().toISOString(),
      mode: selected.mode || 'loop',
      items: (selected.items || []).map((item) => this.normalizePlaylistItem(item, machineId)),
    };
  }

  matchInstallerForSoftware(softwareName, machineId) {
    const component = AUTO_INSTALL_COMPONENTS.find((item) => item.softwareName.toLowerCase() === String(softwareName || '').toLowerCase());
    if (!component) {
      return null;
    }

    return this.getInstallerCatalog(machineId).find((installer) => {
      const haystack = `${installer.fileName} ${installer.productName}`.toLowerCase();
      return component.installerHints.some((hint) => haystack.includes(hint));
    }) || null;
  }

  handleEnvironmentReport(machineId, report) {
    if (!report || !report.softwareName) {
      return;
    }

    const softwareName = String(report.softwareName);
    if (report.installed) {
      return;
    }

    const device = this.discoveredDevices.get(machineId) || {};
    if (device.autoInstallTarget === softwareName && device.installStatus && ['downloading', 'installing'].includes(device.installStatus)) {
      return;
    }

    const installer = this.matchInstallerForSoftware(softwareName, machineId);
    if (!installer) {
      return;
    }

    const ws = this.clients.get(machineId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.updateDevice(machineId, {
      autoInstallTarget: softwareName,
      installStatus: 'queued',
      installMessage: `Auto install queued for ${softwareName}`,
      installUpdatedAt: new Date().toISOString(),
    });
    this.sendCommand(ws, 'INSTALL_PACKAGE', installer);
  }

  savePlaylist(payload) {
    fs.writeFileSync(PLAYLIST_PATH, JSON.stringify(payload, null, 2));
  }

  async saveAndDispatchPlaylist(machineId, payload) {
    const syncId = payload?.syncId || this.createTraceId('playlist');
    const normalized = {
      ...this.normalizePlaylistDocument(payload, machineId || null),
      syncId,
    };
    this.logEvent('playlist_save_requested', {
      category: 'playlist',
      ...this.summarizePlaylistForLog(machineId, normalized),
    });

    if (machineId) {
      const overrides = this.loadDevicePlaylists();
      overrides[machineId] = normalized;
      this.saveDevicePlaylists(overrides);
    } else {
      this.savePlaylist(normalized);
    }

    let resolved = this.getResolvedPlaylist(machineId);
    if (machineId) {
      resolved = await this.pushPlaylistAssetsToDevice(machineId, resolved);
      const ws = this.clients.get(machineId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendCommand(ws, 'SET_PLAYLIST', { ...resolved, applyStrategy: 'immediate' });
      }
      this.logEvent('playlist_dispatch_completed', {
        category: 'playlist',
        ...this.summarizePlaylistForLog(machineId, resolved),
        target: 'single-device',
      });
      return resolved;
    }

    this.broadcastCommand('SET_PLAYLIST', resolved);
    this.logEvent('playlist_dispatch_completed', {
      category: 'playlist',
      ...this.summarizePlaylistForLog(machineId, resolved),
      target: 'broadcast',
      approvedClientCount: Array.from(this.clients.keys()).filter((clientMachineId) => this.approvedDevices.has(clientMachineId)).length,
    });
    return resolved;
  }

  removeAssetReferences(fileName) {
    const normalizedFileName = this.normalizeAssetRelativePath(fileName);
    const scrub = (document) => ({
      ...document,
      items: (document.items || []).filter((item) => this.normalizeAssetRelativePath(item.path || '') !== normalizedFileName),
      updatedAt: new Date().toISOString(),
    });

    const globalPlaylist = JSON.parse(fs.readFileSync(PLAYLIST_PATH, 'utf8'));
    this.savePlaylist(scrub(globalPlaylist));

    const overrides = this.loadDevicePlaylists();
    for (const [machineId, playlist] of Object.entries(overrides)) {
      overrides[machineId] = scrub(playlist);
      const ws = this.clients.get(machineId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendCommand(ws, 'SET_PLAYLIST', {
          ...this.getResolvedPlaylist(machineId),
          applyStrategy: 'immediate',
        });
      }
    }
    this.saveDevicePlaylists(overrides);

    this.broadcastCommand('SET_PLAYLIST', {
      ...this.getResolvedPlaylist(),
      applyStrategy: 'immediate',
    });
  }

  updateDevice(machineId, patch) {
    const previous = this.discoveredDevices.get(machineId) || { machineId };
    this.discoveredDevices.set(machineId, { ...previous, ...patch });
    this.writeDiagnosticsSnapshot('device-update');
  }

  revokeClientSession(machineId, reason = 'revoked') {
    const ws = this.clients.get(machineId);
    if (!ws) {
      return;
    }

    try {
      ws.__adRevoked = reason;
      ws.close(4001, reason);
    } catch (error) {
      this.logEvent('ws_revoke_close_failed', {
        category: 'ws',
        machineId,
        reason,
        message: error.message,
      }, 'warn');
      try {
        ws.terminate();
      } catch (terminateError) {
        this.logEvent('ws_revoke_terminate_failed', {
          category: 'ws',
          machineId,
          reason,
          message: terminateError.message,
        }, 'warn');
      }
    } finally {
      this.clients.delete(machineId);
    }
  }

  broadcastToAdmin(payload) {
    const serialized = JSON.stringify(payload);
    for (const ws of this.adminClients) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      try {
        ws.send(serialized);
      } catch (error) {
        log.warn('Failed to broadcast payload to admin client', {
          message: error.message,
          type: payload?.type || null,
        });
      }
    }
  }

  sendCommand(ws, command, data) {
    const commandId = this.createTraceId('cmd');
    const targetMachineId = Array.from(this.clients.entries()).find(([, candidate]) => candidate === ws)?.[0] || null;
    this.logEvent('command_sent', {
      category: 'command',
      commandId,
      command,
      targetMachineId,
      syncId: data?.syncId || null,
      summary: command === 'SET_PLAYLIST'
        ? this.summarizePlaylistForLog(targetMachineId, data || {})
        : {
          machineId: targetMachineId,
          keys: data && typeof data === 'object' ? Object.keys(data) : [],
        },
    });
    ws.send(
      JSON.stringify({
        type: 'COMMAND',
        commandId,
        command,
        data,
      })
    );
  }

  broadcastCommand(command, data) {
    for (const [machineId, ws] of this.clients.entries()) {
      if (!this.approvedDevices.has(machineId) || ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      this.sendCommand(ws, command, data);
    }
  }

  start() {
    this.writeDiagnosticsSnapshot('server-start', true);
    this.httpServer.listen(HTTP_PORT, () => {
      log.info(`Admin UI ready at http://${this.getPreferredServerIp()}:${HTTP_PORT}`);
    });

    this.udpSocket.bind(UDP_PORT, () => {
      try {
        this.udpSocket.setBroadcast(true);
      } catch (error) {
        log.warn('Failed to enable UDP broadcast', error);
      }
      log.info(`UDP discovery listening on 0.0.0.0:${UDP_PORT}`);
    });

    log.info(`WebSocket server listening on 0.0.0.0:${WS_PORT}`);
  }

  stop() {
    for (const ws of this.clients.values()) {
      try {
        ws.close();
      } catch (error) {
        log.warn('Failed to close client socket', error);
      }
    }

    this.clients.clear();
    for (const ws of this.adminClients) {
      try {
        ws.close();
      } catch (error) {
        log.warn('Failed to close admin socket', error);
      }
    }
    this.adminClients.clear();

    try {
      if (typeof this.stopWebSocketGateway === 'function') {
        this.stopWebSocketGateway();
      }
    } catch (error) {
      log.warn('Failed to stop WS heartbeat timer', error);
    }

    try {
      this.wss.close();
    } catch (error) {
      log.warn('Failed to close WS server', error);
    }

    try {
      this.udpSocket.close();
    } catch (error) {
      log.warn('Failed to close UDP server', error);
    }

    try {
      this.httpServer.close();
    } catch (error) {
      log.warn('Failed to close HTTP server', error);
    }
  }
}

module.exports = AdServer;
