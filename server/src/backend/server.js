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
const ip = require('ip');
const log = require('electron-log');
const registerSystemRoutes = require('./routes/system');
const registerAssetRoutes = require('./routes/assets');
const registerPlaylistRoutes = require('./routes/playlist');
const registerDeviceRoutes = require('./routes/devices');
const registerWebSocketGateway = require('./ws-gateway');
const registerUdpDiscovery = require('./udp-discovery');

const HTTP_PORT = Number(process.env.AD_SERVER_HTTP_PORT || 3000);
const WS_PORT = Number(process.env.AD_SERVER_WS_PORT || 3001);
const UDP_PORT = Number(process.env.AD_SERVER_UDP_PORT || 8888);
const DEFAULT_PAIRING_KEY = process.env.AD_PAIRING_KEY || 'AS_LOCAL_PAIRING_20260310';
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
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const TEXT_EXTENSIONS = new Set(['.txt', '.html', '.htm']);
const ADMIN_TOKEN = process.env.AD_ADMIN_TOKEN || 'CHANGE_ME_ADMIN_TOKEN';
const CLIENT_PUSH_SHARE_NAME = process.env.AD_CLIENT_PUSH_SHARE_NAME || 'screen';
const CLIENT_PUSH_SUBDIR = process.env.AD_CLIENT_PUSH_SUBDIR || path.join('client', 'media-staging');
const REMOTE_START_USER = process.env.AD_REMOTE_START_USER || 'masiro';
const REMOTE_START_PASSWORD = process.env.AD_REMOTE_START_PASSWORD || '20031026alsterm';
const REMOTE_START_TASK_NAME = process.env.AD_REMOTE_START_TASK_NAME || 'AdvertisingScreenClient';
const AUTO_INSTALL_COMPONENTS = [
  {
    softwareName: 'VLC',
    installerHints: ['vlc'],
  },
];

class AdServer {
  constructor() {
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.wss = new WebSocket.Server({ port: WS_PORT });
    this.udpSocket = dgram.createSocket('udp4');
    this.clients = new Map();
    this.adminClients = new Set();
    this.discoveredDevices = new Map();
    this.approvedDevices = new Set();
    this.pairingKey = DEFAULT_PAIRING_KEY;
    this.assetUpload = multer({ dest: path.join(STORAGE_ROOT, '_uploads_assets') });
    this.installerUpload = multer({ dest: path.join(STORAGE_ROOT, '_uploads_installers') });
    this.stopWebSocketGateway = null;

    this.ensureStorage();
    this.initExpress();
    this.initWebSocket();
    this.initUDP();
  }

  ensureStorage() {
    fs.mkdirSync(MEDIA_ROOT, { recursive: true });
    fs.mkdirSync(INSTALLERS_ROOT, { recursive: true });
    fs.mkdirSync(RELEASES_ROOT, { recursive: true });
    fs.mkdirSync(SCREENSHOTS_ROOT, { recursive: true });
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
    this.app.use(
      express.static(path.join(__dirname, '../admin-ui'), {
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
      adminToken: ADMIN_TOKEN,
      httpPort: HTTP_PORT,
      wsPort: WS_PORT,
      udpPort: UDP_PORT,
    });
    registerAssetRoutes(this, {
      app: this.app,
      mediaRoot: MEDIA_ROOT,
    });
    registerPlaylistRoutes(this, { app: this.app });
    registerDeviceRoutes(this, { app: this.app });

    this.app.post('/api/installers/upload', this.installerUpload.single('file'), async (req, res) => {
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

        const fileHash = this.createMd5Hash(req.file.path);
        const safeFileName = `${fileHash}.msi`;
        const targetPath = path.join(INSTALLERS_ROOT, safeFileName);

        try {
          await fs.promises.access(targetPath, fs.constants.F_OK);
        } catch (_error) {
          await fs.promises.copyFile(req.file.path, targetPath);
        }
        await fs.promises.rm(req.file.path, { force: true });
        res.json({ success: true, installer: this.getInstallerCatalog().find((item) => item.fileName === safeFileName) });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
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

  summarizePlaylist(machineId, payload) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return {
      machineId: machineId || null,
      mode: payload?.mode || 'loop',
      itemCount: items.length,
      items: items.map((item) => ({
        type: item.type || this.getMediaType(item.path || item.fileName || item.src || ''),
        path: item.path || item.fileName || item.src || null,
        durationMs: typeof item.durationMs === 'number' ? item.durationMs : null,
      })),
    };
  }

  getServerIpForMachine(machineId) {
    const device = machineId ? this.discoveredDevices.get(machineId) : null;
    return (device && device.serverIp) || this.getPreferredServerIp();
  }

  getLocalIPv4Addresses() {
    return Object.values(os.networkInterfaces())
      .flat()
      .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
      .map((entry) => entry.address);
  }

  isPrivateLanIp(address) {
    const parts = String(address || '').split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }

    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }

  getPreferredServerIp() {
    const candidates = this.getLocalIPv4Addresses();
    const privateCandidates = candidates.filter((address) => this.isPrivateLanIp(address));
    if (privateCandidates.length) {
      return privateCandidates[0];
    }
    return candidates[0] || ip.address();
  }

  getIpv4PrefixScore(left, right) {
    const leftParts = String(left || '').split('.');
    const rightParts = String(right || '').split('.');
    let score = 0;
    for (let index = 0; index < 4; index += 1) {
      if (leftParts[index] !== rightParts[index]) {
        break;
      }
      score += 1;
    }
    return score;
  }

  resolveServerIpForClient(clientIp) {
    const candidates = this.getLocalIPv4Addresses();
    if (!candidates.length) {
      return this.getPreferredServerIp();
    }

    const ranked = candidates
      .map((address) => ({
        address,
        score: this.getIpv4PrefixScore(address, clientIp) + (this.isPrivateLanIp(address) ? 10 : 0),
      }))
      .sort((left, right) => right.score - left.score);

    return ranked[0]?.address || this.getPreferredServerIp();
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
        '/U', REMOTE_START_USER,
        '/P', REMOTE_START_PASSWORD,
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
        const startedMs = Date.now();
        log.info('Pushing playlist asset to client', {
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
        log.info('Playlist asset pushed to client', {
          machineId,
          fileName: item.fileName,
          skipped: result.skipped,
          size: result.size,
          durationMs: Date.now() - startedMs,
          targetPath: result.targetPath,
        });
      }
    } catch (error) {
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

    return {
      ...playlist,
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
    return `http://${ip.address()}:${HTTP_PORT}/screenshots/${encodeURIComponent(fileName)}`;
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
    const normalized = this.normalizePlaylistDocument(payload, machineId || null);
    log.info('Saving playlist document', this.summarizePlaylist(machineId, normalized));

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
      return resolved;
    }

    this.broadcastCommand('SET_PLAYLIST', resolved);
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
    log.info('Sending command to client', {
      command,
      targetMachineId: Array.from(this.clients.entries()).find(([, candidate]) => candidate === ws)?.[0] || null,
      summary: command === 'SET_PLAYLIST' ? this.summarizePlaylist(data?.machineId || null, data || {}) : data,
    });
    ws.send(
      JSON.stringify({
        type: 'COMMAND',
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
    this.httpServer.listen(HTTP_PORT, () => {
      log.info(`Admin UI ready at http://${ip.address()}:${HTTP_PORT}`);
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
