const loadLocalEnv = require('./load-env');

loadLocalEnv();

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const dgram = require('dgram');
const { pathToFileURL } = require('url');
const { fileURLToPath } = require('url');
const { execFile, execFileSync, spawn } = require('child_process');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  powerSaveBlocker,
  shell,
} = require('electron');
const axios = require('axios');
const WebSocket = require('ws');
const log = require('electron-log');

function getRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value || /^REPLACE_/i.test(value) || /^CHANGE_ME/i.test(value)) {
    throw new Error(`${name} must be configured before starting the client`);
  }
  return value;
}

function writeBootstrapCrash(error) {
  try {
    const logsDir = process.mainModule && process.mainModule.filename && String(process.mainModule.filename).includes('app.asar')
      ? path.join(path.dirname(process.execPath), 'logs')
      : path.join(__dirname, '..', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const targetPath = path.join(logsDir, 'client-bootstrap.log');
    const lines = [
      `[${new Date().toISOString()}] bootstrap failure`,
      error && error.stack ? error.stack : String(error),
      '',
    ];
    fs.appendFileSync(targetPath, lines.join('\n'), 'utf8');
  } catch (_error) {
    // Startup crash logging must never throw.
  }
}

let createMediaManager;
let createAutoLaunchManager;
let createUpdater;
try {
  ({ createMediaManager } = require('./media-manager'));
  ({ createAutoLaunchManager } = require('./services/auto-launch'));
  ({ createUpdater } = require('./services/updater'));
} catch (error) {
  writeBootstrapCrash(error);
  throw error;
}

const UDP_PORT = Number(process.env.AD_SERVER_UDP_PORT || 8888);
const DEFAULT_HTTP_PORT = Number(process.env.AD_SERVER_HTTP_PORT || 3000);
const DEFAULT_WS_PORT = Number(process.env.AD_SERVER_WS_PORT || 3001);
const DISCOVERY_INTERVAL_MS = 5000;
const NETWORK_PROBE_DELAY_MS = Number(process.env.AD_NETWORK_PROBE_DELAY_MS || 10000);
const NETWORK_PROBE_TIMEOUT_MS = Number(process.env.AD_NETWORK_PROBE_TIMEOUT_MS || 1000);
const NETWORK_PROBE_CONCURRENCY = Number(process.env.AD_NETWORK_PROBE_CONCURRENCY || 10);
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_BACKOFF_MS = 30000;
const AUTO_START_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const AUTO_START_NAME = 'AdvertisingScreenClient';
const REMOTE_START_TASK_NAME = 'AdvertisingScreenClient';
const REMOTE_START_WATCHER_TASK_NAME = 'AdvertisingScreenClientRemoteStartWatcher';
const PAIRING_KEY = getRequiredEnv('AD_PAIRING_KEY');
const NIGHTLY_REFRESH_HOUR = Number(process.env.AD_NIGHTLY_REFRESH_HOUR || 3);
const MAX_CACHE_FILE_AGE_MS = Number(process.env.AD_CACHE_MAX_AGE_MS || 14 * 24 * 60 * 60 * 1000);
const DOWNLOAD_RETRY_COUNT = Number(process.env.AD_DOWNLOAD_RETRY_COUNT || 3);
const DOWNLOAD_STATUS_INTERVAL_MS = 1000;
const WS_WATCHDOG_TIMEOUT_MS = Number(process.env.AD_WS_WATCHDOG_TIMEOUT_MS || 30000);
const WS_WATCHDOG_INTERVAL_MS = Number(process.env.AD_WS_WATCHDOG_INTERVAL_MS || 5000);
const LOG_MAX_SIZE_BYTES = Number(process.env.AD_LOG_MAX_SIZE_BYTES || 5 * 1024 * 1024);
const LOG_RETENTION_COUNT = Number(process.env.AD_LOG_RETENTION_COUNT || 10);

let mainWindow = null;
let udpSocket = null;
let ws = null;
let powerBlockerId = null;
let discoveryTimer = null;
let networkProbeTimer = null;
let manualPollTimer = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let wsWatchdogTimer = null;
let lastWsActivityAt = 0;
let serverInfo = null;
let isQuitting = false;
let currentPlaybackState = { mode: 'loop', items: [] };
let maintenanceTimer = null;
let pendingPairingCode = null;
let gpuStatus = null;
let pendingStatusReports = [];
let previousCpuSnapshot = null;
let playlistApplyToken = 0;
let activeDownloads = {};
let currentPlaylistSyncId = null;
let lastCommandContext = null;
let clientLogDir = null;
let diagnosticsSnapshotPath = null;
let lastDiagnosticsWriteAt = 0;
let lastStatusSnapshot = {};
let latestDiagnosticsExportPath = null;
let diskSnapshotLoadedAt = 0;
let diskSnapshotInFlight = null;
let latestDiskSnapshot = {
  diskUsage: null,
  storageDevices: [],
};
let networkProbeInFlight = false;
let manualServerConfig = null;
let fixedServerConfig = null;
let connectionMode = 'auto-discovery';
let lastConnectionProbe = null;

const machineId = os.hostname();
const cacheRoot = path.join(app.getPath('userData'), 'media-cache');
const installerCacheRoot = path.join(app.getPath('userData'), 'installer-cache');
const packagedRuntimeRoot = path.join(path.dirname(process.execPath), 'client');
const legacyPackagedRuntimeRoot = path.dirname(process.execPath);
const defaultPerUserInstallRoot = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'Programs', 'AdvertisingScreenClient')
  : path.join(app.getPath('home'), 'AppData', 'Local', 'Programs', 'AdvertisingScreenClient');
const runtimeRoot = app.isPackaged ? packagedRuntimeRoot : path.join(__dirname, '..');
const defaultMediaLibraryRoot = path.join(runtimeRoot, 'media-library');
const sharedMediaStagingRoot = path.join(runtimeRoot, 'media-staging');
let localMediaLibraryRoot = defaultMediaLibraryRoot;
const pendingUpdateMarkerPath = path.join(app.getPath('userData'), 'pending-update.json');
const releaseArchiveRoot = path.join(app.getPath('userData'), 'release-history');
const installedReleaseManifestPath = path.join(app.getPath('userData'), 'installed-release.json');
const clientConfigPath = path.join(app.getPath('userData'), 'client-config.json');
const playbackSnapshotPath = path.join(app.getPath('userData'), 'last-playback.json');
const controlRoot = path.join(runtimeRoot, 'control');
const remoteStartTriggerPath = path.join(controlRoot, 'start-request.json');
const remoteStartWatcherScriptPath = path.join(controlRoot, 'remote-start-watcher.ps1');

function migrateLegacyRuntimeDirectory(legacyPath, nextPath) {
  if (!app.isPackaged || legacyPath === nextPath || !fs.existsSync(legacyPath)) {
    return;
  }
  try {
    fs.mkdirSync(nextPath, { recursive: true });
    fs.cpSync(legacyPath, nextPath, { recursive: true, force: true });
  } catch (error) {
    log.warn('Failed to migrate legacy runtime directory', {
      legacyPath,
      nextPath,
      message: error?.message || String(error),
    });
  }
}

function normalizeComparablePath(targetPath) {
  return path.resolve(String(targetPath || '')).replace(/[\\/]+$/, '').toLowerCase();
}

function removeDirectoryIfExists(targetPath, label) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return false;
  }
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    log.info(`Removed ${label}`, { targetPath });
    return true;
  } catch (error) {
    log.warn(`Failed to remove ${label}`, {
      targetPath,
      message: error?.message || String(error),
    });
    return false;
  }
}

function terminateConflictingClientProcessesSync() {
  if (process.platform !== 'win32' || !app.isPackaged) {
    return;
  }
  try {
    const script = [
      `$currentPid = ${process.pid}`,
      "Get-CimInstance Win32_Process -Filter \"Name = 'AdvertisingScreenClient.exe'\" |",
      "Where-Object { $_.ProcessId -ne $currentPid } |",
      "ForEach-Object {",
      "  try {",
      "    Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop",
      "    [PSCustomObject]@{ pid = $_.ProcessId; path = $_.ExecutablePath }",
      "  } catch { }",
      "} | ConvertTo-Json -Compress",
    ].join(' ');
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (output) {
      writeBootstrapCrash(`terminated conflicting client processes: ${output}`);
    }
  } catch (_error) {
    // Startup self-heal must never block the main process lock acquisition.
  }
}

function cleanupLegacyClientArtifactsOnStartup() {
  if (process.platform !== 'win32' || !app.isPackaged) {
    return;
  }

  cleanupAutoLaunchArtifacts().catch((error) => {
    log.warn('Failed to clean auto launch artifacts during startup', {
      message: error?.message || String(error),
    });
  });

  const currentExecDir = path.dirname(process.execPath);
  const currentExecDirNormalized = normalizeComparablePath(currentExecDir);
  const defaultInstallNormalized = normalizeComparablePath(defaultPerUserInstallRoot);

  removeDirectoryIfExists(path.join(legacyPackagedRuntimeRoot, 'media-library'), 'legacy media-library directory');
  removeDirectoryIfExists(path.join(legacyPackagedRuntimeRoot, 'media-staging'), 'legacy media-staging directory');
  removeDirectoryIfExists(path.join(legacyPackagedRuntimeRoot, 'control'), 'legacy control directory');

  if (currentExecDirNormalized !== defaultInstallNormalized) {
    removeDirectoryIfExists(defaultPerUserInstallRoot, 'conflicting per-user installed client directory');
  }
}

terminateConflictingClientProcessesSync();

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

function resolveWritableLogDir() {
  const preferredDir = process.env.AD_LOG_DIR
    ? path.resolve(process.env.AD_LOG_DIR)
    : app.isPackaged
      ? path.join(path.dirname(process.execPath), 'logs')
      : path.join(__dirname, '..', 'logs');
  const fallbackDir = path.join(app.getPath('userData'), 'logs');
  const candidates = [preferredDir, fallbackDir];

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      const probePath = path.join(candidate, '.write-test');
      fs.writeFileSync(probePath, 'ok');
      fs.rmSync(probePath, { force: true });
      return candidate;
    } catch (_error) {
      continue;
    }
  }

  return fallbackDir;
}

function configureLogging() {
  const logDir = resolveWritableLogDir();
  log.transports.file.level = 'info';
  log.transports.file.resolvePathFn = () => path.join(logDir, 'client-main.log');
  log.transports.file.maxSize = LOG_MAX_SIZE_BYTES;
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
  log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
  pruneLogFiles(logDir, 'client-main', LOG_RETENTION_COUNT);
  clientLogDir = logDir;
  diagnosticsSnapshotPath = path.join(logDir, 'client-diagnostics.json');
  process.env.AD_ACTIVE_CLIENT_LOG_DIR = logDir;
}

function pruneLogFiles(logDir, baseName, keepCount) {
  try {
    const entries = fs.readdirSync(logDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.startsWith(baseName))
      .map((entry) => {
        const fullPath = path.join(logDir, entry.name);
        const stats = fs.statSync(fullPath);
        return { fullPath, mtimeMs: stats.mtimeMs };
      })
      .sort((left, right) => right.mtimeMs - left.mtimeMs);
    for (const stale of entries.slice(Math.max(keepCount, 1))) {
      fs.rmSync(stale.fullPath, { force: true });
    }
  } catch (_error) {
    // Log pruning is best-effort.
  }
}

function logUnhandledError(label, error) {
  if (error instanceof Error) {
    log.error(label, {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return;
  }

  log.error(label, error);
}

function logStructured(label, payload = {}, level = 'info') {
  const logger = typeof log[level] === 'function' ? log[level].bind(log) : log.info.bind(log);
  logger(label, {
    machineId,
    ...payload,
  });
}

function createTraceId(prefix = 'trace') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function summarizePlaylistForLog(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    syncId: payload.syncId || null,
    mode: payload.mode || 'loop',
    applyStrategy: payload.applyStrategy || 'immediate',
    itemCount: items.length,
    items: items.slice(0, 10).map((item) => ({
      type: item?.type || null,
      path: item?.path || item?.fileName || null,
      originalSrc: item?.originalSrc || item?.src || null,
      durationMs: typeof item?.durationMs === 'number' ? item.durationMs : null,
      folderPlayMode: item?.folderPlayMode || null,
    })),
  };
}

function logClientEvent(event, details = {}, level = 'info') {
  logStructured(event, {
    service: 'client',
    event,
    playlistSyncId: details.playlistSyncId || currentPlaylistSyncId || null,
    commandId: details.commandId || lastCommandContext?.commandId || null,
    ...details,
  }, level);
}

function buildClientDiagnosticsSnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    machineId,
    appVersion: app.getVersion(),
    logDir: clientLogDir,
    diagnosticsSnapshotPath,
    currentPlaylistSyncId,
    serverInfo,
    pendingPairingCode,
    lastCommandContext,
    playback: {
      mode: currentPlaybackState.mode || null,
      applyStrategy: currentPlaybackState.applyStrategy || null,
      itemCount: Array.isArray(currentPlaybackState.items) ? currentPlaybackState.items.length : 0,
      firstItems: Array.isArray(currentPlaybackState.items)
        ? currentPlaybackState.items.slice(0, 10).map((item) => ({
          type: item?.type || null,
          src: item?.src || null,
          originalSrc: item?.originalSrc || null,
          path: item?.path || null,
          durationMs: typeof item?.durationMs === 'number' ? item.durationMs : null,
        }))
        : [],
    },
    status: lastStatusSnapshot,
    activeDownloads,
    runtime: {
      localMediaLibraryRoot,
      sharedMediaStagingRoot,
      cacheRoot,
      installerCacheRoot,
      controlRoot,
      isPackaged: app.isPackaged,
    },
    diskSnapshot: latestDiskSnapshot,
  };
}

function writeClientDiagnosticsSnapshot(reason = 'manual', force = false) {
  if (!diagnosticsSnapshotPath) {
    return null;
  }
  const now = Date.now();
  if (!force && now - lastDiagnosticsWriteAt < 1000) {
    return diagnosticsSnapshotPath;
  }
  const payload = {
    reason,
    ...buildClientDiagnosticsSnapshot(),
  };
  try {
    fs.mkdirSync(path.dirname(diagnosticsSnapshotPath), { recursive: true });
    fs.writeFileSync(diagnosticsSnapshotPath, JSON.stringify(payload, null, 2));
    lastDiagnosticsWriteAt = now;
    return diagnosticsSnapshotPath;
  } catch (error) {
    log.warn('Failed to write client diagnostics snapshot', {
      reason,
      message: error?.message || String(error),
    });
    return null;
  }
}

function isPrivateLanIp(address) {
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

function resolvePreferredLocalIp() {
  const candidates = Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
  const privateCandidate = candidates.find((address) => isPrivateLanIp(address));
  return privateCandidate || candidates[0] || null;
}

function applyDiscoveredServer(nextServerInfo, source = 'unknown') {
  if (!nextServerInfo || !nextServerInfo.serverIp) {
    return false;
  }

  const approved = Boolean(nextServerInfo.approved);
  serverInfo = {
    serverIp: nextServerInfo.serverIp,
    wsPort: Number(nextServerInfo.wsPort) || DEFAULT_WS_PORT,
    httpPort: Number(nextServerInfo.httpPort) || DEFAULT_HTTP_PORT,
    approved,
  };
  pendingPairingCode = nextServerInfo.pairingCode || null;

  clearTimeout(networkProbeTimer);
  sendStatus({
    discovery: source === 'active-http-probe' ? 'server-found-http' : 'server-found',
    approved,
    pairingCode: pendingPairingCode,
    connectionProbe: lastConnectionProbe,
  });
  logClientEvent('server_discovered', {
    category: 'discovery',
    source,
    serverIp: serverInfo.serverIp,
    httpPort: serverInfo.httpPort,
    wsPort: serverInfo.wsPort,
    approved,
  });

  if (approved && !hasReusableWebSocket(serverInfo)) {
    connectWebSocket();
  }

  return true;
}

function sendWsJson(payload, logLabel = null) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  ws.send(JSON.stringify(payload));
  if (logLabel) {
    logStructured(logLabel, payload);
  }
  return true;
}

function sanitizeDownloadStatus(status = {}) {
  return {
    scope: status.scope || 'media',
    syncId: status.syncId || null,
    state: status.state || 'idle',
    fileName: status.fileName || null,
    percent: typeof status.percent === 'number' ? status.percent : null,
    downloadedBytes: typeof status.downloadedBytes === 'number' ? status.downloadedBytes : null,
    totalBytes: typeof status.totalBytes === 'number' ? status.totalBytes : null,
    bytesPerSecond: typeof status.bytesPerSecond === 'number' ? status.bytesPerSecond : null,
    startedAt: status.startedAt || null,
    updatedAt: status.updatedAt || new Date().toISOString(),
    error: status.error || null,
  };
}

function loadClientConfig() {
  try {
    if (!fs.existsSync(clientConfigPath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(clientConfigPath, 'utf8')) || {};
  } catch (_error) {
    return {};
  }
}

function saveClientConfig(config) {
  fs.writeFileSync(clientConfigPath, JSON.stringify(config, null, 2));
}


function parseManualServerEndpoint(rawInput, source = 'manual') {
  const raw = String(rawInput || '').trim();
  if (!raw) {
    return null;
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch (error) {
    throw new Error(`Invalid server address: ${raw}`);
  }

  const protocol = String(parsed.protocol || '').toLowerCase();
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(protocol)) {
    throw new Error(`Unsupported server address protocol: ${parsed.protocol}`);
  }

  const host = String(parsed.hostname || '').trim();
  if (!host) {
    throw new Error('Server address host is required');
  }

  const explicitPort = parsed.port ? Number(parsed.port) : null;
  const httpPort = protocol === 'http:' || protocol === 'https:'
    ? explicitPort || DEFAULT_HTTP_PORT
    : Number(process.env.AD_SERVER_HTTP_PORT || DEFAULT_HTTP_PORT);
  const wsPort = protocol === 'ws:' || protocol === 'wss:'
    ? explicitPort || DEFAULT_WS_PORT
    : Number(process.env.AD_SERVER_WS_PORT || DEFAULT_WS_PORT);

  return {
    source,
    rawInput: raw,
    host,
    httpPort,
    wsPort,
    displayAddress: `${host}:${httpPort}`,
  };
}

function normalizeManualServerConfig(config = {}) {
  const raw = String(config.manualServerAddress || '').trim();
  if (!raw) {
    return null;
  }
  return parseManualServerEndpoint(raw, 'manual-config');
}

function resolveFixedServerConfigFromEnv() {
  const raw = String(process.env.AD_SERVER_FIXED_IP || process.env.AD_SERVER_HOST || '').trim();
  if (!raw) {
    return null;
  }
  return parseManualServerEndpoint(raw, process.env.AD_SERVER_FIXED_IP ? 'env-fixed-ip' : 'env-host');
}

function resolveConfiguredServerEndpoint() {
  return fixedServerConfig || manualServerConfig || null;
}

function getConnectionStatusFields() {
  const configuredEndpoint = resolveConfiguredServerEndpoint();
  return {
    connectionMode,
    configuredServerAddress: configuredEndpoint?.displayAddress || null,
    configuredServerSource: configuredEndpoint?.source || null,
    localIp: resolvePreferredLocalIp(),
    connectionProbe: lastConnectionProbe,
  };
}

function updateClientAutoStartConfig(enabled) {
  const config = loadClientConfig();
  config.autoStartConfig = {
    hasAsked: true,
    enabled: Boolean(enabled),
    updatedAt: new Date().toISOString(),
  };
  saveClientConfig(config);
  return config.autoStartConfig;
}

const {
  normalizeAutoStartConfig,
  setupAutoLaunch,
  cleanupAutoLaunchArtifacts,
  resolveAutoStartConsent,
} = createAutoLaunchManager({
  fs,
  path,
  execFile,
  app,
  log,
  controlRoot,
  remoteStartTriggerPath,
  remoteStartWatcherScriptPath,
  autoStartRegPath: AUTO_START_REG_PATH,
  autoStartName: AUTO_START_NAME,
  remoteStartTaskName: REMOTE_START_TASK_NAME,
  remoteStartWatcherTaskName: REMOTE_START_WATCHER_TASK_NAME,
  loadClientConfig,
  updateClientAutoStartConfig,
  baseDir: __dirname,
});

function resolveMediaLibraryPath(candidatePath) {
  const raw = String(candidatePath || '').trim();
  if (!raw) {
    return defaultMediaLibraryRoot;
  }
  return path.resolve(raw);
}

function applyClientConfig(config = {}) {
  localMediaLibraryRoot = resolveMediaLibraryPath(config.mediaLibraryPath);
  fixedServerConfig = resolveFixedServerConfigFromEnv();
  manualServerConfig = normalizeManualServerConfig(config);
  connectionMode = fixedServerConfig ? 'fixed-env' : (manualServerConfig ? 'manual' : 'auto-discovery');
}

function persistMediaLibraryPath(nextPath) {
  const config = loadClientConfig();
  config.mediaLibraryPath = nextPath;
  saveClientConfig(config);
  applyClientConfig(config);
}

function migrateMediaLibraryPath(nextPath) {
  const resolvedTargetPath = resolveMediaLibraryPath(nextPath);
  const resolvedCurrentPath = resolveMediaLibraryPath(localMediaLibraryRoot);
  if (resolvedTargetPath === resolvedCurrentPath) {
    fs.mkdirSync(resolvedTargetPath, { recursive: true });
    return resolvedTargetPath;
  }

  fs.mkdirSync(resolvedTargetPath, { recursive: true });
  if (fs.existsSync(resolvedCurrentPath)) {
    fs.cpSync(resolvedCurrentPath, resolvedTargetPath, { recursive: true, force: true });
    const currentLower = resolvedCurrentPath.toLowerCase();
    const targetLower = resolvedTargetPath.toLowerCase();
    if (!targetLower.startsWith(`${currentLower}${path.sep}`) && !currentLower.startsWith(`${targetLower}${path.sep}`)) {
      fs.rmSync(resolvedCurrentPath, { recursive: true, force: true });
    }
  }

  persistMediaLibraryPath(resolvedTargetPath);
  return resolvedTargetPath;
}

function getCurrentStorageDrive() {
  const resolved = path.resolve(localMediaLibraryRoot);
  return path.parse(resolved).root.replace(/[\\/]+$/, '').toUpperCase();
}

function refreshDiskSnapshot(force = false) {
  const now = Date.now();
  if (!force && latestDiskSnapshot.diskUsage && now - diskSnapshotLoadedAt < 30000) {
    return Promise.resolve(latestDiskSnapshot);
  }
  if (diskSnapshotInFlight) {
    return diskSnapshotInFlight;
  }

  const script = "$drives = Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID, Size, FreeSpace; $drives | ConvertTo-Json -Compress";
  diskSnapshotInFlight = new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], (error, stdout) => {
      if (error) {
        log.warn('Failed to refresh disk snapshot', error);
        diskSnapshotInFlight = null;
        resolve(latestDiskSnapshot);
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim() || '[]');
        const items = Array.isArray(parsed) ? parsed : [parsed];
        const storageDevices = items
          .filter(Boolean)
          .map((item) => {
            const totalBytes = Number(item.Size || 0);
            const freeBytes = Number(item.FreeSpace || 0);
            const usedBytes = Math.max(0, totalBytes - freeBytes);
            return {
              drive: String(item.DeviceID || '').toUpperCase(),
              totalBytes,
              freeBytes,
              usedBytes,
              percent: totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : null,
            };
          });
        const currentDrive = getCurrentStorageDrive();
        latestDiskSnapshot = {
          diskUsage: storageDevices.find((item) => item.drive === currentDrive) || null,
          storageDevices,
        };
        diskSnapshotLoadedAt = Date.now();
      } catch (parseError) {
        log.warn('Failed to parse disk snapshot', parseError);
      }

      diskSnapshotInFlight = null;
      resolve(latestDiskSnapshot);
    });
  });

  return diskSnapshotInFlight;
}

function reportDownloadStatus(scope, patch = {}) {
  const nextStatus = sanitizeDownloadStatus({
    ...(activeDownloads[scope] || {}),
    ...patch,
    scope,
    syncId: patch.syncId || currentPlaylistSyncId || null,
  });
  activeDownloads = {
    ...activeDownloads,
    [scope]: nextStatus,
  };
  sendStatus({ downloadStatus: activeDownloads });
  if (['retrying', 'failed', 'completed'].includes(String(nextStatus.state || '').toLowerCase())) {
    logClientEvent('download_status_changed', {
      category: 'download',
      scope,
      state: nextStatus.state,
      fileName: nextStatus.fileName,
      percent: nextStatus.percent,
      error: nextStatus.error,
      playlistSyncId: nextStatus.syncId || null,
    }, nextStatus.state === 'failed' ? 'warn' : 'info');
  }
  sendWsJson({
    type: 'DOWNLOAD_STATUS',
    status: nextStatus,
  });
}

configureLogging();

process.on('uncaughtException', (error) => {
  logUnhandledError('Client uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  logUnhandledError('Client unhandledRejection', reason);
});

function createFingerprint() {
  return crypto.createHash('sha256').update(`${machineId}:${PAIRING_KEY}`).digest('hex');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const connectionStatus = getConnectionStatusFields();
  lastStatusSnapshot = {
    ...lastStatusSnapshot,
    ...connectionStatus,
    ...status,
    serverIp: serverInfo ? serverInfo.serverIp : null,
    httpPort: serverInfo ? serverInfo.httpPort : null,
    wsPort: serverInfo ? serverInfo.wsPort : null,
    updatedAt: new Date().toISOString(),
  };
  writeClientDiagnosticsSnapshot('status-update');
  mainWindow.webContents.send('player:status', {
    ...connectionStatus,
    ...status,
    serverIp: serverInfo ? serverInfo.serverIp : null,
    httpPort: serverInfo ? serverInfo.httpPort : null,
    wsPort: serverInfo ? serverInfo.wsPort : null,
  });
}

function calculateDirectoryUsage(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return 0;
  }

  return fs.readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((total, entry) => total + fs.statSync(path.join(directoryPath, entry.name)).size, 0);
}

function takeCpuSnapshot() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function calculateCpuPercent() {
  const currentSnapshot = takeCpuSnapshot();
  if (!previousCpuSnapshot) {
    previousCpuSnapshot = currentSnapshot;
    return null;
  }

  let idleDelta = 0;
  let totalDelta = 0;
  for (let index = 0; index < currentSnapshot.length; index += 1) {
    const previous = previousCpuSnapshot[index];
    const current = currentSnapshot[index];
    if (!previous || !current) {
      continue;
    }

    const previousTotal = Object.values(previous).reduce((sum, value) => sum + value, 0);
    const currentTotal = Object.values(current).reduce((sum, value) => sum + value, 0);
    idleDelta += current.idle - previous.idle;
    totalDelta += currentTotal - previousTotal;
  }

  previousCpuSnapshot = currentSnapshot;
  if (totalDelta <= 0) {
    return null;
  }

  return Math.max(0, Math.min(100, Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(1))));
}

async function reportHeartbeatStatus() {
  const mediaBytes = calculateDirectoryUsage(cacheRoot);
  const installerBytes = calculateDirectoryUsage(installerCacheRoot);
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
  const cpuPercent = calculateCpuPercent();
  const diskInfo = await refreshDiskSnapshot(false);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  sendWsJson({
    type: 'HEARTBEAT',
    status: {
      diskUsage: {
        mediaBytes,
        installerBytes,
        totalBytes: diskInfo.diskUsage?.usedBytes || null,
        freeBytes: diskInfo.diskUsage?.freeBytes || null,
        quotaBytes: diskInfo.diskUsage?.totalBytes || null,
        drive: diskInfo.diskUsage?.drive || getCurrentStorageDrive(),
      },
      memoryUsage: {
        usedBytes: usedMemoryBytes,
        totalBytes: totalMemoryBytes,
        percent: totalMemoryBytes > 0 ? Number(((usedMemoryBytes / totalMemoryBytes) * 100).toFixed(1)) : null,
      },
      cpuUsage: {
        percent: cpuPercent,
        cores: os.cpus().length,
      },
      gpuStatus,
      downloadStatus: activeDownloads,
      clientVersion: app.getVersion(),
      mediaLibraryPath: localMediaLibraryRoot,
      localIp: resolvePreferredLocalIp(),
      connectionMode,
      configuredServerAddress: resolveConfiguredServerEndpoint()?.displayAddress || null,
      storageDevices: diskInfo.storageDevices,
    },
  });
}

function sendPlaylist() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('playlist:update', currentPlaybackState);
}

function persistPlaybackSnapshot() {
  try {
    fs.writeFileSync(playbackSnapshotPath, JSON.stringify(currentPlaybackState, null, 2));
  } catch (error) {
    log.warn('Failed to persist playback snapshot', error);
  }
}

function restorePlaybackSnapshot() {
  if (!fs.existsSync(playbackSnapshotPath)) {
    return false;
  }
  try {
    const snapshot = JSON.parse(fs.readFileSync(playbackSnapshotPath, 'utf8'));
    if (!snapshot || !Array.isArray(snapshot.items) || !snapshot.items.length) {
      return false;
    }
    currentPlaybackState = {
      mode: snapshot.mode || 'loop',
      items: snapshot.items,
    };
    logStructured('Restored local playback snapshot', {
      itemCount: snapshot.items.length,
      mode: currentPlaybackState.mode,
    });
    return true;
  } catch (error) {
    log.warn('Failed to restore playback snapshot', error);
    return false;
  }
}

function checkEnvironment(softwareName) {
  const safeName = String(softwareName || '').replace(/'/g, "''");
  const script = `Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName -like '*${safeName}*' } | Select-Object -ExpandProperty DisplayName`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], (error, stdout) => {
      if (error) {
        log.warn('Environment check failed', error);
        resolve(false);
        return;
      }
      resolve(Boolean(stdout.trim()));
    });
  });
}

function isAllowedDownloadUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!serverInfo) {
      return false;
    }
    return ['http:', 'https:'].includes(url.protocol) && url.hostname === serverInfo.serverIp;
  } catch (error) {
    return false;
  }
}

const MAX_CACHE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2GB 磁盘配额
const mediaManager = createMediaManager({
  fs,
  path,
  crypto,
  axios,
  log,
  logEvent: logClientEvent,
  getCurrentPlaylistSyncId: () => currentPlaylistSyncId,
  pathToFileURL,
  getLocalMediaLibraryRoot: () => localMediaLibraryRoot,
  sharedMediaStagingRoot,
  cacheRoot,
  installerCacheRoot,
  reportDownloadStatus,
  isAllowedDownloadUrl,
  maxCacheQuotaBytes: MAX_CACHE_QUOTA_BYTES,
  downloadRetryCount: DOWNLOAD_RETRY_COUNT,
  downloadStatusIntervalMs: DOWNLOAD_STATUS_INTERVAL_MS,
});
const {
  sha256File,
  md5File,
  enforceCacheQuota,
  downloadToPath,
  cacheMediaItem,
} = mediaManager;

function reportInstallStatus(status, message) {
  const payload = {
    type: 'INSTALL_STATUS',
    status,
    message,
  };
  logClientEvent('install_status_reported', {
    category: 'install',
    status,
    message,
  }, ['failed', 'update-failed'].includes(String(status || '').toLowerCase()) ? 'warn' : 'info');
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendWsJson(payload, 'Install status sent');
    return;
  }
  pendingStatusReports.push(payload);
}

async function checkEnvironmentDetailed(softwareName) {
  const installed = await checkEnvironment(softwareName);
  return {
    softwareName,
    installed,
  };
}

async function sendEnvironmentReport(softwareName) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const report = await checkEnvironmentDetailed(softwareName);
  sendWsJson({
    type: 'ENV_REPORT',
    report,
  }, 'Environment report sent');
}

function flushPendingStatusReports() {
  if (!ws || ws.readyState !== WebSocket.OPEN || pendingStatusReports.length === 0) {
    return;
  }
  for (const payload of pendingStatusReports) {
    ws.send(JSON.stringify(payload));
  }
  pendingStatusReports = [];
}

function getWebSocketTargetKey(target = serverInfo) {
  if (!target || !target.serverIp || !target.wsPort) {
    return null;
  }
  return `${target.serverIp}:${target.wsPort}`;
}

function hasReusableWebSocket(target = serverInfo) {
  const targetKey = getWebSocketTargetKey(target);
  if (!ws || !targetKey) {
    return false;
  }
  return (
    ws.__adTargetKey === targetKey &&
    (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
  );
}

const {
  recoverPendingUpdateMarker,
  installPackage,
  applyClientUpdate,
} = createUpdater({
  fs,
  path,
  execFile,
  spawn,
  app,
  log,
  installerCacheRoot,
  pendingUpdateMarkerPath,
  releaseArchiveRoot,
  installedReleaseManifestPath,
  isAllowedDownloadUrl,
  enforceCacheQuota,
  downloadToPath,
  sha256File,
  md5File,
  reportInstallStatus,
  checkEnvironmentDetailed,
  sendEnvironmentReport,
});

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function applyPlaylist(payload) {
  const applyToken = ++playlistApplyToken;
  const syncId = payload?.syncId || createTraceId('playlist');
  currentPlaylistSyncId = syncId;
  const mode = payload.mode || 'loop';
  const items = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.playlist)
      ? payload.playlist
      : Array.isArray(payload)
        ? payload
        : [];
  const resolved = [];

  const publishPlaybackState = () => {
    if (playlistApplyToken !== applyToken || resolved.length === 0) {
      return;
    }

    logClientEvent('playlist_apply_completed', {
      category: 'playlist',
      ...summarizePlaylistForLog({
        syncId,
        mode,
        items: resolved,
        applyStrategy: payload.applyStrategy || 'immediate',
      }),
      incremental: false,
    });

    currentPlaybackState = {
      syncId,
      mode,
      applyStrategy: payload.applyStrategy || 'immediate',
      items: [...resolved],
    };
    persistPlaybackSnapshot();
    sendPlaylist();
    sendStatus({ playlist: `ready:${resolved.length}`, mode });
  };

  logClientEvent('playlist_apply_started', {
    category: 'playlist',
    ...summarizePlaylistForLog({
      syncId,
      mode,
      items,
      applyStrategy: payload.applyStrategy || 'immediate',
    }),
  });

  const resolvedItems = await mapWithConcurrency(items, 3, async (item) => {
    if (playlistApplyToken !== applyToken) {
      return null;
    }
    try {
      if (item?.type === 'folder' && item?.path) {
        const folderEntries = Array.isArray(item.entries) ? item.entries : [];
        const resolvedEntries = (await mapWithConcurrency(folderEntries, 3, async (entry) => {
          if (playlistApplyToken !== applyToken) {
            return null;
          }
          try {
            const cachedEntry = await cacheMediaItem(entry);
            if (cachedEntry) {
              return {
                ...cachedEntry,
                ...(typeof entry.durationMs === 'number' ? { durationMs: entry.durationMs } : {}),
              };
            }
          } catch (error) {
            log.warn('Failed to cache folder entry', {
              folderPath: item.path,
              fileName: entry?.fileName || entry?.path || null,
              syncId,
              message: error?.message || String(error),
            });
          }
          return null;
        })).filter(Boolean);
        if (!resolvedEntries.length) {
          await mediaManager.syncStagedFolderToLocalLibrary(item.path);
        }
        return {
          type: 'folder',
          path: String(item.path),
          folderPlayMode: String(item.folderPlayMode || 'sequence').toLowerCase() === 'random' ? 'random' : 'sequence',
          ...(resolvedEntries.length ? { entries: resolvedEntries } : {}),
          ...(typeof item.durationMs === 'number' ? { durationMs: item.durationMs } : {}),
        };
      }
      return await cacheMediaItem(item);
    } catch (error) {
      logClientEvent('playlist_item_cache_failed', {
        category: 'playlist',
        syncId,
        itemType: item?.type || null,
        itemPath: item?.path || item?.fileName || item?.src || null,
        error: error?.message || String(error),
      }, 'warn');
      return null;
    }
  });
  resolved.push(...resolvedItems.filter(Boolean));

  if (playlistApplyToken !== applyToken) {
    return;
  }

  if (resolved.length === 0) {
    logClientEvent('playlist_apply_empty', {
      category: 'playlist',
      itemCount: items.length,
      syncId,
    }, 'warn');
    sendStatus({ playlist: 'empty-or-invalid' });
    return;
  }

  publishPlaybackState();
}

async function fetchCurrentPlaylist() {
  if (!serverInfo) {
    return;
  }

  logStructured('Fetching current playlist', {
    serverIp: serverInfo.serverIp,
    httpPort: serverInfo.httpPort,
  });
  const response = await axios.get(`http://${serverInfo.serverIp}:${serverInfo.httpPort}/api/client/playlist?machineId=${encodeURIComponent(machineId)}`, {
    timeout: 10000,
  });
  await applyPlaylist(response.data);
}

async function probeServerHello(candidate, timeoutMs = NETWORK_PROBE_TIMEOUT_MS) {
  const endpoint = typeof candidate === 'string'
    ? { host: candidate, httpPort: DEFAULT_HTTP_PORT, wsPort: DEFAULT_WS_PORT, source: 'active-http-probe', displayAddress: `${candidate}:${DEFAULT_HTTP_PORT}` }
    : candidate;
  if (!endpoint || !endpoint.host) {
    return null;
  }

  const startedAt = Date.now();
  try {
    const response = await axios.get(`http://${endpoint.host}:${endpoint.httpPort || DEFAULT_HTTP_PORT}/api/client/hello`, {
      params: {
        machineId,
        deviceName: os.hostname(),
        platform: `${os.platform()} ${os.release()}`,
        clientIp: resolvePreferredLocalIp(),
      },
      timeout: timeoutMs,
    });
    const payload = response.data || {};
    if (payload.type !== 'SERVER_HELLO') {
      return null;
    }
    return {
      serverIp: endpoint.host,
      reportedServerIp: payload.serverIp || null,
      httpPort: Number(payload.httpPort) || endpoint.httpPort || DEFAULT_HTTP_PORT,
      wsPort: Number(payload.wsPort) || endpoint.wsPort || DEFAULT_WS_PORT,
      approved: Boolean(payload.approved),
      pairingCode: payload.pairingCode || null,
      latencyMs: Date.now() - startedAt,
      source: endpoint.source || 'http-hello',
      displayAddress: endpoint.displayAddress || `${endpoint.host}:${endpoint.httpPort || DEFAULT_HTTP_PORT}`,
      serverTime: payload.serverTime || null,
    };
  } catch (error) {
    lastConnectionProbe = {
      ok: false,
      source: endpoint.source || 'http-hello',
      target: endpoint.displayAddress || `${endpoint.host}:${endpoint.httpPort || DEFAULT_HTTP_PORT}`,
      latencyMs: Date.now() - startedAt,
      error: error?.code || error?.message || String(error),
      checkedAt: new Date().toISOString(),
    };
    return null;
  }
}

async function testConfiguredServerConnection(endpoint = resolveConfiguredServerEndpoint()) {
  if (!endpoint) {
    return { ok: false, error: 'No server address configured' };
  }
  const result = await probeServerHello(endpoint, Math.max(NETWORK_PROBE_TIMEOUT_MS, 3000));
  if (!result) {
    sendStatus({ connectionProbe: lastConnectionProbe, discovery: 'server-test-failed' });
    return { ok: false, probe: lastConnectionProbe };
  }
  lastConnectionProbe = {
    ok: true,
    source: result.source,
    target: result.displayAddress,
    latencyMs: result.latencyMs,
    approved: result.approved,
    pairingCode: result.pairingCode || null,
    serverIp: result.serverIp,
    reportedServerIp: result.reportedServerIp,
    checkedAt: new Date().toISOString(),
  };
  sendStatus({ connectionProbe: lastConnectionProbe, discovery: 'server-test-ok' });
  return { ok: true, probe: lastConnectionProbe, server: result };
}

function stopDiscoverySocket() {
  clearInterval(discoveryTimer);
  discoveryTimer = null;
  clearTimeout(networkProbeTimer);
  if (udpSocket) {
    try {
      udpSocket.close();
    } catch (error) {
      log.warn('Failed to close UDP discovery socket', error);
    }
    udpSocket = null;
  }
}

function scheduleManualServerRetry(reason = 'configured-server-retry', delayMs = DISCOVERY_INTERVAL_MS) {
  clearTimeout(manualPollTimer);
  if (isQuitting || !resolveConfiguredServerEndpoint()) {
    return;
  }
  manualPollTimer = setTimeout(() => {
    manualPollTimer = null;
    if (!isQuitting && resolveConfiguredServerEndpoint()) {
      applyManualServerConnection(false, reason).catch((error) => {
        log.warn('Configured server retry failed', error);
      });
    }
  }, delayMs);
}

async function applyManualServerConnection(forceReconnect = false, reason = 'configured-server') {
  const endpoint = resolveConfiguredServerEndpoint();
  if (!endpoint) {
    return false;
  }

  clearTimeout(manualPollTimer);
  manualPollTimer = null;
  connectionMode = fixedServerConfig ? 'fixed-env' : 'manual';
  stopDiscoverySocket();
  if (forceReconnect && ws) {
    terminateWebSocketClient(ws, 'manual-server-change');
    ws = null;
  }
  clearTimeout(reconnectTimer);
  sendStatus({ discovery: 'testing-configured-server', ws: forceReconnect ? 'reconnecting' : undefined });

  const probe = await testConfiguredServerConnection(endpoint);
  if (!probe.ok || !probe.server) {
    logClientEvent('configured_server_probe_failed', {
      category: 'discovery',
      reason,
      endpoint: endpoint.displayAddress,
      probe: probe.probe || null,
    }, 'warn');
    scheduleManualServerRetry('configured-server-unreachable');
    return false;
  }

  applyDiscoveredServer(probe.server, endpoint.source || reason);
  if (!probe.server.approved) {
    scheduleManualServerRetry('configured-server-awaiting-approval');
  }
  return true;
}

function restartAutomaticDiscovery() {
  clearTimeout(manualPollTimer);
  manualPollTimer = null;
  fixedServerConfig = resolveFixedServerConfigFromEnv();
  if (fixedServerConfig) {
    connectionMode = 'fixed-env';
    return applyManualServerConnection(true, 'fixed-env-restored');
  }
  manualServerConfig = null;
  connectionMode = 'auto-discovery';
  lastConnectionProbe = null;
  serverInfo = null;
  pendingPairingCode = null;
  if (ws) {
    terminateWebSocketClient(ws, 'auto-discovery-reset');
    ws = null;
  }
  createDiscoverySocket();
  sendStatus({ discovery: 'searching', ws: 'idle', pairingCode: null, approved: false });
  return true;
}

async function scanLocalNetworkForServer() {
  if (networkProbeInFlight || serverInfo || isQuitting) {
    return;
  }

  const localIp = resolvePreferredLocalIp();
  if (!localIp) {
    log.warn('Skipped local network probing because no local IPv4 address is available');
    return;
  }

  const octets = localIp.split('.');
  if (octets.length !== 4) {
    log.warn('Skipped local network probing because local IPv4 address is invalid', { localIp });
    return;
  }

  networkProbeInFlight = true;
  const prefix = `${octets[0]}.${octets[1]}.${octets[2]}.`;
  const selfHost = Number(octets[3]);
  const candidates = [];
  for (let host = 1; host <= 254; host += 1) {
    if (host === selfHost) {
      continue;
    }
    candidates.push(`${prefix}${host}`);
  }

  sendStatus({ discovery: 'probing-lan' });
  logClientEvent('network_probe_started', {
    category: 'discovery',
    localIp,
    prefix,
    timeoutMs: NETWORK_PROBE_TIMEOUT_MS,
    concurrency: NETWORK_PROBE_CONCURRENCY,
    candidateCount: candidates.length,
  });

  let nextIndex = 0;
  let matchedServer = null;
  const workerCount = Math.max(1, Math.min(NETWORK_PROBE_CONCURRENCY, candidates.length));

  async function worker() {
    while (!matchedServer && nextIndex < candidates.length && !isQuitting) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const result = await probeServerHello(candidates[currentIndex]);
      if (result && !matchedServer) {
        matchedServer = result;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    if (matchedServer) {
      applyDiscoveredServer(matchedServer, 'active-http-probe');
    } else if (!serverInfo) {
      sendStatus({ discovery: 'probe-miss' });
      logClientEvent('network_probe_miss', {
        category: 'discovery',
        prefix,
        candidateCount: candidates.length,
      }, 'warn');
    }
  } finally {
    networkProbeInFlight = false;
  }
}

function scheduleNetworkProbeFallback() {
  clearTimeout(networkProbeTimer);
  networkProbeTimer = setTimeout(() => {
    if (!serverInfo && !networkProbeInFlight && !isQuitting) {
      scanLocalNetworkForServer().catch((error) => {
        networkProbeInFlight = false;
        log.warn('Active HTTP probing failed', error);
      });
    }
  }, NETWORK_PROBE_DELAY_MS);
}

function createDiscoverySocket() {
  if (udpSocket) {
    return;
  }
  udpSocket = dgram.createSocket('udp4');

  udpSocket.on('message', (msg, rinfo) => {
    try {
      const payload = JSON.parse(msg.toString());
      if (payload.type !== 'SERVER_ACK') {
        return;
      }

      applyDiscoveredServer({
        serverIp: payload.serverIp || rinfo.address,
        wsPort: payload.wsPort || DEFAULT_WS_PORT,
        httpPort: payload.httpPort || DEFAULT_HTTP_PORT,
        approved: Boolean(payload.approved),
        pairingCode: payload.pairingCode || null,
      }, 'udp-ack');
    } catch (error) {
      log.warn('Failed to parse UDP ack', error);
    }
  });

  udpSocket.bind(() => {
    udpSocket.setBroadcast(true);
    broadcastDiscovery();
    discoveryTimer = setInterval(broadcastDiscovery, DISCOVERY_INTERVAL_MS);
    scheduleNetworkProbeFallback();
  });
}

function broadcastDiscovery() {
  if (!udpSocket) {
    return;
  }

  const payload = Buffer.from(
    JSON.stringify({
      type: 'DISCOVERY',
      machineId,
      deviceName: os.hostname(),
      platform: `${os.platform()} ${os.release()}`,
    })
  );

  udpSocket.send(payload, UDP_PORT, '255.255.255.255', (error) => {
    if (error) {
      log.warn('UDP discovery send failed', error);
    }
  });
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    reportHeartbeatStatus();
  }, HEARTBEAT_INTERVAL_MS);
}

function markWsActivity() {
  lastWsActivityAt = Date.now();
}

function stopWsWatchdog() {
  clearInterval(wsWatchdogTimer);
  wsWatchdogTimer = null;
}

function startWsWatchdog(targetWs) {
  stopWsWatchdog();
  markWsActivity();
  wsWatchdogTimer = setInterval(() => {
    if (!targetWs || targetWs !== ws || targetWs.readyState !== WebSocket.OPEN) {
      return;
    }
    if (Date.now() - lastWsActivityAt <= WS_WATCHDOG_TIMEOUT_MS) {
      return;
    }
    logStructured('WebSocket watchdog timeout', {
      serverIp: serverInfo?.serverIp || null,
      wsPort: serverInfo?.wsPort || null,
      timeoutMs: WS_WATCHDOG_TIMEOUT_MS,
    }, 'warn');
    terminateWebSocketClient(targetWs, 'watchdog-timeout');
    if (!isQuitting) {
      scheduleReconnect();
    }
  }, WS_WATCHDOG_INTERVAL_MS);
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectAttempts += 1;
  const delay = Math.min(1000 * (2 ** reconnectAttempts), MAX_BACKOFF_MS);
  reconnectTimer = setTimeout(() => {
    if (serverInfo && serverInfo.approved) {
      connectWebSocket();
      return;
    }
    if (resolveConfiguredServerEndpoint()) {
      applyManualServerConnection(false, 'reconnect').catch((error) => log.warn('Configured server reconnect failed', error));
      return;
    }
    broadcastDiscovery();
  }, delay);
  sendStatus({ ws: 'reconnecting', retryInMs: delay });
}

function terminateWebSocketClient(targetWs, reason = 'previous') {
  if (!targetWs) {
    return;
  }

  try {
    targetWs.removeAllListeners();
    if (typeof targetWs.terminate === 'function' && targetWs.readyState === WebSocket.OPEN) {
      targetWs.terminate();
    } else if (targetWs.readyState === WebSocket.CONNECTING && targetWs._socket) {
      targetWs._socket.destroy();
    }
  } catch (error) {
    logUnhandledError(`WebSocket cleanup error (${reason}, safe to ignore)`, error);
  } finally {
    stopWsWatchdog();
    if (ws === targetWs) {
      ws = null;
    }
  }
}

function handleCommand(payload) {
  lastCommandContext = {
    command: payload.command,
    commandId: payload.commandId || null,
    receivedAt: new Date().toISOString(),
  };
  logClientEvent('command_received', {
    category: 'command',
    command: payload.command,
    commandId: payload.commandId || null,
    syncId: payload.data?.syncId || null,
    dataKeys: payload.data && typeof payload.data === 'object' ? Object.keys(payload.data) : [],
  });
  switch (payload.command) {
    case 'CHECK_ENV':
      checkEnvironment(payload.data.softwareName || 'VLC').then((installed) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'ENV_STATUS',
              softwareName: payload.data.softwareName,
              installed,
            })
          );
        }
      });
      break;
    case 'RELOAD_PLAYER':
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reloadIgnoringCache();
      }
      break;
    case 'QUIT_CLIENT':
      logStructured('Remote quit command accepted');
      setTimeout(() => {
        app.quit();
      }, 100);
      break;
    case 'CAPTURE_SCREEN':
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.capturePage().then(img => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'SCREENSHOT_DATA',
              data: img.toDataURL(),
              timestamp: new Date().toISOString()
            }));
          }
        }).catch(err => log.error('Capture failed', err));
      }
      break;
    case 'SET_PLAYLIST':
      if (payload.data) {
        applyPlaylist(payload.data).catch((error) => {
          log.warn('Failed to apply pushed playlist', error);
        });
      }
      break;
    case 'SET_MEDIA_LIBRARY_DIR': {
      const nextPath = String(payload.data?.path || '').trim();
      if (!nextPath) {
        log.warn('SET_MEDIA_LIBRARY_DIR ignored because path is empty');
        break;
      }
      const resolvedPath = migrateMediaLibraryPath(nextPath);
      refreshDiskSnapshot(true).catch((error) => log.warn('Failed to refresh disk snapshot after media path change', error));
      logStructured('Media library path updated', { mediaLibraryPath: resolvedPath });
      sendStatus({ mediaLibraryPath: resolvedPath });
      reportHeartbeatStatus();
      break;
    }
    case 'PURGE_ASSET':
      purgeCachedAsset(payload.data)
        .then(() => fetchCurrentPlaylist().catch((error) => log.warn('Failed to refresh playlist after purge', error)))
        .catch((error) => log.warn('Failed to purge asset', error));
      break;
    case 'APPLY_CLIENT_UPDATE':
      applyClientUpdate(payload.data)
        .then(() => log.info('Client update package executed', payload.data.fileName))
        .catch((error) => {
          log.warn('Client update failed', error);
          reportInstallStatus('update-failed', error.message);
        });
      break;
    case 'INSTALL_PACKAGE':
      installPackage(payload.data)
        .then(() => {
          log.info('MSI install completed', payload.data.fileName);
        })
        .catch((error) => {
          log.warn('MSI install failed', error);
          reportInstallStatus('failed', error.message);
        });
      break;
    default:
      log.info('Unknown command', payload.command);
  }
}

async function purgeCachedAsset(asset) {
  if (!asset) {
    return;
  }

  if (asset.sha256 && asset.src) {
    const extension = path.extname(new URL(asset.src).pathname) || '.bin';
    const candidate = path.join(cacheRoot, `${asset.sha256}${extension}`);
    if (fs.existsSync(candidate)) {
      fs.rmSync(candidate, { force: true });
    }
  }

  currentPlaybackState = {
    ...currentPlaybackState,
    items: currentPlaybackState.items.filter((item) => item.originalSrc !== asset.src),
  };
  persistPlaybackSnapshot();
  writeClientDiagnosticsSnapshot('purge-cached-asset');
  sendPlaylist();
  reportHeartbeatStatus();
}

function connectWebSocket() {
  if (!serverInfo || !serverInfo.serverIp || !serverInfo.approved) {
    return;
  }

  if (hasReusableWebSocket(serverInfo)) {
    return;
  }

  if (ws) {
    terminateWebSocketClient(ws, 'previous');
  }

  const nextWs = new WebSocket(`ws://${serverInfo.serverIp}:${serverInfo.wsPort}`);
  nextWs.__adTargetKey = getWebSocketTargetKey(serverInfo);
  ws = nextWs;

  nextWs.on('open', () => {
    reconnectAttempts = 0;
    markWsActivity();
    logClientEvent('ws_opened', {
      category: 'ws',
      serverIp: serverInfo.serverIp,
      wsPort: serverInfo.wsPort,
    });
    nextWs.send(
      JSON.stringify({
        type: 'REGISTER',
        machineId,
        pairingKey: PAIRING_KEY,
        fingerprint: createFingerprint(),
      })
    );
    sendStatus({ ws: 'connected', approved: true });
    startHeartbeat();
    startWsWatchdog(nextWs);
    reportHeartbeatStatus();
  });

  nextWs.on('ping', () => {
    markWsActivity();
  });

  nextWs.on('pong', () => {
    markWsActivity();
  });

  nextWs.on('message', (data) => {
    markWsActivity();
    try {
      const payload = JSON.parse(data.toString());
      if (payload.type === 'AUTH_OK') {
        logClientEvent('ws_auth_ok', {
          category: 'ws',
          serverTime: payload.serverTime || null,
        });
        pendingPairingCode = null;
        sendStatus({ auth: 'ok', pairingCode: null });
        flushPendingStatusReports();
        sendEnvironmentReport('VLC').catch((error) => log.warn('Failed to send initial VLC environment report', error));
        fetchCurrentPlaylist().catch((error) => log.warn('Failed to sync playlist', error));
        return;
      }
      if (payload.type === 'AUTH_REJECTED') {
        logClientEvent('ws_auth_rejected', {
          category: 'ws',
        }, 'warn');
        serverInfo.approved = false;
        sendStatus({ auth: 'rejected', approved: false, pairingCode: pendingPairingCode });
        return;
      }
      if (payload.type === 'COMMAND') {
        handleCommand(payload);
      }
    } catch (error) {
      log.warn('Failed to process ws payload', error);
    }
  });

  nextWs.on('close', () => {
    logClientEvent('ws_closed', {
      category: 'ws',
      serverIp: serverInfo?.serverIp || null,
      wsPort: serverInfo?.wsPort || null,
    }, 'warn');
    clearInterval(heartbeatTimer);
    stopWsWatchdog();
    if (ws === nextWs) {
      ws = null;
    }
    sendStatus({ ws: 'closed' });
    if (!isQuitting) {
      scheduleReconnect();
    }
  });

  nextWs.on('error', (error) => {
    markWsActivity();
    log.warn('WebSocket error', error);
    if (nextWs.readyState !== WebSocket.CLOSED && nextWs.readyState !== WebSocket.CLOSING) {
      terminateWebSocketClient(nextWs, 'errored');
    }
  });
}

function cleanup() {
  isQuitting = true;
  writeClientDiagnosticsSnapshot('cleanup', true);
  clearInterval(discoveryTimer);
  clearTimeout(networkProbeTimer);
  clearTimeout(manualPollTimer);
  clearInterval(heartbeatTimer);
  stopWsWatchdog();
  clearInterval(maintenanceTimer);
  clearTimeout(reconnectTimer);

  if (udpSocket) {
    try {
      udpSocket.close();
    } catch (error) {
      log.warn('Failed to close UDP socket', error);
    }
  }

  if (ws) {
    terminateWebSocketClient(ws, 'active');
    ws = null;
  }

  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
}

function cleanupCacheDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return;
  }

  const now = Date.now();
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = path.join(directoryPath, entry.name);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > MAX_CACHE_FILE_AGE_MS) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

function scheduleNightlyRefresh() {
  let lastRefreshDate = '';
  maintenanceTimer = setInterval(() => {
    const now = new Date();
    const currentDate = now.toISOString().slice(0, 10);
    if (
      now.getHours() === NIGHTLY_REFRESH_HOUR &&
      now.getMinutes() < 5 &&
      lastRefreshDate !== currentDate &&
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {
      lastRefreshDate = currentDate;
      cleanupCacheDirectory(cacheRoot);
      cleanupCacheDirectory(installerCacheRoot);
      sendStatus({ maintenance: 'nightly-refresh' });
      mainWindow.webContents.reloadIgnoringCache();
    }
  }, 60 * 1000);
}

app.whenReady().then(async () => {
  applyClientConfig(loadClientConfig());
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  if (app.isPackaged) {
    const autoStartEnabled = resolveAutoStartConsent();
    if (autoStartEnabled) {
      await setupAutoLaunch();
    }
  }
  cleanupCacheDirectory(cacheRoot);
  cleanupCacheDirectory(installerCacheRoot);
  migrateLegacyRuntimeDirectory(path.join(legacyPackagedRuntimeRoot, 'media-library'), defaultMediaLibraryRoot);
  migrateLegacyRuntimeDirectory(path.join(legacyPackagedRuntimeRoot, 'media-staging'), sharedMediaStagingRoot);
  migrateLegacyRuntimeDirectory(path.join(legacyPackagedRuntimeRoot, 'control'), controlRoot);
  cleanupLegacyClientArtifactsOnStartup();
  fs.mkdirSync(localMediaLibraryRoot, { recursive: true });
  fs.mkdirSync(sharedMediaStagingRoot, { recursive: true });
  fs.mkdirSync(controlRoot, { recursive: true });
  fs.mkdirSync(releaseArchiveRoot, { recursive: true });
  refreshDiskSnapshot(true).catch((error) => log.warn('Failed to initialize disk snapshot', error));
  gpuStatus = app.getGPUFeatureStatus();
  previousCpuSnapshot = takeCpuSnapshot();
  if (!loadInstalledReleaseManifest()) {
    saveInstalledReleaseManifest({
      version: app.getVersion(),
      fileName: null,
      kind: null,
      silentArgs: null,
      packagePath: null,
      updatedAt: new Date().toISOString(),
    });
  }
  recoverPendingUpdateMarker();
  createWindow();
  restorePlaybackSnapshot();
  writeClientDiagnosticsSnapshot('app-ready', true);
  log.info(`Client log file: ${log.transports.file.getFile().path}`);
  if (resolveConfiguredServerEndpoint()) {
    applyManualServerConnection(false, 'startup').catch((error) => log.warn('Configured server startup connection failed', error));
  } else {
    createDiscoverySocket();
  }
  scheduleNightlyRefresh();
  sendStatus({ discovery: resolveConfiguredServerEndpoint() ? 'configured-server' : 'searching', ws: 'idle', mediaLibraryPath: localMediaLibraryRoot });
});

ipcMain.on('player:ready', () => {
  logStructured('Renderer ready');
  sendPlaylist();
  sendStatus({ mediaLibraryPath: localMediaLibraryRoot, discovery: resolveConfiguredServerEndpoint() ? 'configured-server' : 'searching' });
});

ipcMain.on('player:log', (_event, payload) => {
  const enrichedPayload = {
    ...(payload || {}),
    syncId: payload?.syncId || currentPlaylistSyncId || null,
  };
  logClientEvent('renderer_event', {
    category: 'playback',
    eventType: enrichedPayload?.type || null,
    syncId: enrichedPayload.syncId,
    playbackItem: enrichedPayload.originalSrc || enrichedPayload.src || null,
    payload: enrichedPayload,
  });
  sendWsJson({
    type: 'PLAYER_LOG',
    syncId: enrichedPayload.syncId,
    eventType: enrichedPayload?.type || null,
    payload: enrichedPayload,
  });
});

ipcMain.on('player:error', (_event, error) => {
  const enrichedError = {
    ...(error || {}),
    syncId: error?.syncId || currentPlaylistSyncId || null,
  };
  logClientEvent('renderer_error_reported', {
    category: 'playback',
    syncId: enrichedError.syncId,
    errorType: enrichedError.type || null,
    playbackItem: enrichedError.originalSrc || enrichedError.src || null,
    message: enrichedError.message || null,
  }, 'warn');
  sendWsJson({
    type: 'PLAYER_ERROR',
    ...enrichedError,
  }, 'Player error forwarded');
});

ipcMain.on('player:quit', () => {
  logStructured('Quit requested from renderer');
  app.quit();
});

ipcMain.handle('player:choose-media-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: 'Select Media Library Folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: localMediaLibraryRoot,
  });
  if (result.canceled || !result.filePaths?.length) {
    return { canceled: true, mediaLibraryPath: localMediaLibraryRoot };
  }

  const nextPath = migrateMediaLibraryPath(result.filePaths[0]);
  await refreshDiskSnapshot(true);
  sendStatus({ mediaLibraryPath: nextPath });
  reportHeartbeatStatus();
  return { canceled: false, mediaLibraryPath: nextPath };
});

ipcMain.handle('player:get-connection-settings', async () => ({
  manualServerAddress: manualServerConfig?.rawInput || '',
  fixedServerAddress: fixedServerConfig?.rawInput || '',
  connectionMode,
  configuredServerAddress: resolveConfiguredServerEndpoint()?.displayAddress || null,
  configuredServerSource: resolveConfiguredServerEndpoint()?.source || null,
  localIp: resolvePreferredLocalIp(),
  serverInfo,
  connectionProbe: lastConnectionProbe,
}));

ipcMain.handle('player:test-server-connection', async (_event, rawAddress = '') => {
  const endpoint = String(rawAddress || '').trim()
    ? parseManualServerEndpoint(rawAddress, 'manual-test')
    : resolveConfiguredServerEndpoint();
  return testConfiguredServerConnection(endpoint);
});

ipcMain.handle('player:set-manual-server-address', async (_event, rawAddress) => {
  const endpoint = parseManualServerEndpoint(rawAddress, 'manual-config');
  if (!endpoint) {
    return {
      ok: false,
      error: 'Server address is required',
    };
  }
  const config = loadClientConfig();
  config.manualServerAddress = endpoint.rawInput;
  config.manualServerUpdatedAt = new Date().toISOString();
  saveClientConfig(config);
  applyClientConfig(config);
  const connected = await applyManualServerConnection(true, 'manual-config-saved');
  return {
    ok: true,
    connected,
    manualServerAddress: endpoint.rawInput,
    configuredServerAddress: endpoint.displayAddress,
    connectionMode,
    connectionProbe: lastConnectionProbe,
  };
});

ipcMain.handle('player:enable-auto-discovery', async () => {
  const config = loadClientConfig();
  delete config.manualServerAddress;
  config.manualServerUpdatedAt = new Date().toISOString();
  saveClientConfig(config);
  applyClientConfig(config);
  restartAutomaticDiscovery();
  return {
    ok: true,
    connectionMode,
    configuredServerAddress: resolveConfiguredServerEndpoint()?.displayAddress || null,
  };
});


ipcMain.handle('player:read-text-content', async (_event, src) => {
  const raw = String(src || '').trim();
  if (!raw) {
    throw new Error('Text source is required');
  }

  const url = new URL(raw);
  if (url.protocol === 'file:') {
    return fs.promises.readFile(fileURLToPath(url), 'utf8');
  }

  if (!isAllowedDownloadUrl(raw)) {
    throw new Error(`Blocked non-whitelisted text url: ${raw}`);
  }

  const response = await axios.get(raw, {
    timeout: 10000,
    responseType: 'text',
  });
  return String(response.data || '');
});

ipcMain.handle('player:list-media-folder', async (_event, relativePath) => {
  const normalizedRelativePath = String(relativePath || '').split(/[\\/]+/).filter(Boolean).join(path.sep);
  try {
    await mediaManager.syncStagedFolderToLocalLibrary(normalizedRelativePath);
  } catch (error) {
    log.warn('Failed to sync staged folder before listing media folder', {
      relativePath: normalizedRelativePath,
      message: error?.message || String(error),
    });
  }
  const targetPath = path.join(localMediaLibraryRoot, normalizedRelativePath);
  const rootRealPath = path.resolve(localMediaLibraryRoot);
  const targetRealPath = path.resolve(targetPath);
  if (!targetRealPath.startsWith(rootRealPath)) {
    throw new Error('Folder path escapes media library root');
  }

  try {
    const stats = await fs.promises.stat(targetRealPath);
    if (!stats.isDirectory()) {
      return [];
    }
  } catch (_error) {
    return [];
  }

  const results = [];
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
  const videoExtensions = new Set(['.mp4', '.webm', '.mov', '.m4v']);
  const textExtensions = new Set(['.txt', '.html', '.htm']);
  const walk = async (directoryPath) => {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const relativeFilePath = path.relative(localMediaLibraryRoot, fullPath).split(path.sep).join('/');
      const extension = path.extname(entry.name).toLowerCase();
      const mediaType = textExtensions.has(extension)
        ? 'text'
        : (videoExtensions.has(extension) ? 'video' : (imageExtensions.has(extension) ? 'image' : null));
      if (!['image', 'video', 'text'].includes(mediaType)) {
        continue;
      }
      results.push({
        type: mediaType,
        path: relativeFilePath,
        name: entry.name,
        src: pathToFileURL(fullPath).href,
      });
    }
  };

  await walk(targetRealPath);
  return results;
});

ipcMain.handle('player:export-diagnostics', async () => {
  writeClientDiagnosticsSnapshot('export-requested', true);
  latestDiagnosticsExportPath = diagnosticsSnapshotPath || clientLogDir;
  return {
    success: true,
    logDir: clientLogDir,
    diagnosticsSnapshotPath,
    logFilePath: log.transports.file.getFile().path,
    latestDiagnosticsExportPath,
  };
});

ipcMain.handle('player:open-diagnostics-folder', async () => {
  const targetPath = latestDiagnosticsExportPath || diagnosticsSnapshotPath || clientLogDir;
  if (!targetPath) {
    throw new Error('No diagnostics export available');
  }
  shell.showItemInFolder(targetPath);
  return {
    success: true,
    targetPath,
  };
});

app.on('render-process-gone', (_event, webContents, details) => {
  log.error('Renderer process gone', {
    reason: details.reason,
    exitCode: details.exitCode,
    url: webContents.getURL(),
  });
});

app.on('child-process-gone', (_event, details) => {
  log.error('Child process gone', details);
});

app.on('before-quit', cleanup);

app.on('window-all-closed', () => {
  app.quit();
});
