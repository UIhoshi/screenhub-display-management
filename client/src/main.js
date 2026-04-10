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
} = require('electron');
const axios = require('axios');
const WebSocket = require('ws');
const log = require('electron-log');

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
try {
  ({ createMediaManager } = require('./media-manager'));
} catch (error) {
  writeBootstrapCrash(error);
  throw error;
}

const UDP_PORT = Number(process.env.AD_SERVER_UDP_PORT || 8888);
const DEFAULT_HTTP_PORT = Number(process.env.AD_SERVER_HTTP_PORT || 3000);
const DEFAULT_WS_PORT = Number(process.env.AD_SERVER_WS_PORT || 3001);
const DISCOVERY_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_BACKOFF_MS = 30000;
const AUTO_START_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const AUTO_START_NAME = 'AdvertisingScreenClient';
const REMOTE_START_TASK_NAME = 'AdvertisingScreenClient';
const REMOTE_START_WATCHER_TASK_NAME = 'AdvertisingScreenClientRemoteStartWatcher';
const PAIRING_KEY = process.env.AD_PAIRING_KEY || 'AS_LOCAL_PAIRING_20260310';
const NIGHTLY_REFRESH_HOUR = Number(process.env.AD_NIGHTLY_REFRESH_HOUR || 3);
const MAX_CACHE_FILE_AGE_MS = Number(process.env.AD_CACHE_MAX_AGE_MS || 14 * 24 * 60 * 60 * 1000);
const DOWNLOAD_RETRY_COUNT = Number(process.env.AD_DOWNLOAD_RETRY_COUNT || 3);
const DOWNLOAD_STATUS_INTERVAL_MS = 1000;
const WS_WATCHDOG_TIMEOUT_MS = Number(process.env.AD_WS_WATCHDOG_TIMEOUT_MS || 30000);
const WS_WATCHDOG_INTERVAL_MS = Number(process.env.AD_WS_WATCHDOG_INTERVAL_MS || 5000);

let mainWindow = null;
let udpSocket = null;
let ws = null;
let powerBlockerId = null;
let discoveryTimer = null;
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
let diskSnapshotLoadedAt = 0;
let diskSnapshotInFlight = null;
let latestDiskSnapshot = {
  diskUsage: null,
  storageDevices: [],
};

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
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
  log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
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

function normalizeAutoStartConfig(config = {}) {
  const autoStartConfig = config && typeof config.autoStartConfig === 'object'
    ? config.autoStartConfig
    : {};
  return {
    hasAsked: autoStartConfig.hasAsked === true,
    enabled: autoStartConfig.enabled === true,
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

function resolveMediaLibraryPath(candidatePath) {
  const raw = String(candidatePath || '').trim();
  if (!raw) {
    return defaultMediaLibraryRoot;
  }
  return path.resolve(raw);
}

function applyClientConfig(config = {}) {
  localMediaLibraryRoot = resolveMediaLibraryPath(config.mediaLibraryPath);
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
  });
  activeDownloads = {
    ...activeDownloads,
    [scope]: nextStatus,
  };
  sendStatus({ downloadStatus: activeDownloads });
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
  mainWindow.webContents.send('player:status', {
    ...status,
    serverIp: serverInfo ? serverInfo.serverIp : null,
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

function getClientLaunchSpec() {
  if (app.isPackaged) {
    return {
      filePath: process.execPath,
      args: [],
      workdir: path.dirname(process.execPath),
    };
  }

  return {
    filePath: 'cmd.exe',
    args: ['/c', 'npm.cmd', 'start'],
    workdir: path.join(__dirname, '..'),
  };
}

function ensureRemoteStartWatcherScript() {
  fs.mkdirSync(controlRoot, { recursive: true });
  const script = [
    "param(",
    "  [string]$TriggerPath,",
    "  [string]$LauncherPath,",
    "  [string]$LauncherArgsJson,",
    "  [string]$WorkingDirectory",
    ")",
    "if (-not (Test-Path -LiteralPath $TriggerPath)) { exit 0 }",
    "try {",
    "  Remove-Item -LiteralPath $TriggerPath -Force -ErrorAction SilentlyContinue",
    "  $launcherArgs = @()",
    "  if ($LauncherArgsJson) {",
    "    $launcherArgs = @(ConvertFrom-Json -InputObject $LauncherArgsJson)",
    "  }",
    "  Start-Process -FilePath $LauncherPath -ArgumentList $launcherArgs -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null",
    "} catch {",
    "  $logPath = Join-Path (Split-Path -Parent $TriggerPath) 'remote-start-watcher-error.log'",
    "  \"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $($_.Exception.Message)\" | Out-File -FilePath $logPath -Append -Encoding UTF8",
    "}",
  ].join('\r\n');
  fs.writeFileSync(remoteStartWatcherScriptPath, script, 'utf8');
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject({
          error,
          stdout,
          stderr,
        });
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function setupAutoLaunch() {
  const exePath = process.execPath.replace(/"/g, '\\"');
  try {
    await execFileAsync('reg', ['add', AUTO_START_REG_PATH, '/v', AUTO_START_NAME, '/t', 'REG_SZ', '/d', `"${exePath}"`, '/f']);
    log.info('Auto start registry entry ensured');
  } catch (result) {
    log.warn('Failed to register auto start', result.error);
  }

  const taskCommand = `"${process.execPath}"`;
  try {
    await execFileAsync('schtasks.exe', [
      '/Create',
      '/TN', REMOTE_START_TASK_NAME,
      '/TR', taskCommand,
      '/SC', 'ONCE',
      '/ST', '00:00',
      '/F',
    ]);
    log.info('Remote start scheduled task ensured', {
      taskName: REMOTE_START_TASK_NAME,
    });
  } catch (result) {
    log.warn('Failed to ensure remote start scheduled task', {
      message: result.error.message,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }

  ensureRemoteStartWatcherScript();
  const launchSpec = getClientLaunchSpec();
  const taskArgs = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-File', remoteStartWatcherScriptPath,
    '-TriggerPath', remoteStartTriggerPath,
    '-LauncherPath', launchSpec.filePath,
    '-LauncherArgsJson', JSON.stringify(launchSpec.args || []),
    '-WorkingDirectory', launchSpec.workdir,
  ];
  try {
    await execFileAsync('schtasks.exe', [
      '/Create',
      '/TN', REMOTE_START_WATCHER_TASK_NAME,
      '/TR', `powershell.exe ${taskArgs.map((arg) => `"${String(arg).replace(/"/g, '""')}"`).join(' ')}`,
      '/SC', 'MINUTE',
      '/MO', '1',
      '/F',
    ]);
    log.info('Remote start watcher task ensured', {
      taskName: REMOTE_START_WATCHER_TASK_NAME,
      triggerPath: remoteStartTriggerPath,
    });
  } catch (result) {
    log.warn('Failed to ensure remote start watcher task', {
      message: result.error.message,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
}

async function cleanupAutoLaunchArtifacts() {
  const cleanupSteps = [
    {
      label: 'client auto start registry entry',
      command: 'reg',
      args: ['delete', AUTO_START_REG_PATH, '/v', AUTO_START_NAME, '/f'],
    },
    {
      label: 'client remote start scheduled task',
      command: 'schtasks.exe',
      args: ['/Delete', '/TN', REMOTE_START_TASK_NAME, '/F'],
    },
    {
      label: 'client remote start watcher task',
      command: 'schtasks.exe',
      args: ['/Delete', '/TN', REMOTE_START_WATCHER_TASK_NAME, '/F'],
    },
  ];

  for (const step of cleanupSteps) {
    try {
      await execFileAsync(step.command, step.args);
      log.info(`Removed ${step.label}`);
    } catch (result) {
      log.info(`Skipped removing ${step.label}`, {
        message: result.error.message,
      });
    }
  }

  try {
    fs.rmSync(remoteStartTriggerPath, { force: true });
  } catch (error) {
    log.info('Failed to remove remote start trigger file', {
      message: error.message,
    });
  }
}

function resolveAutoStartConsent() {
  const config = loadClientConfig();
  const autoStartConfig = normalizeAutoStartConfig(config);
  if (!autoStartConfig.hasAsked) {
    updateClientAutoStartConfig(false);
    return false;
  }
  return autoStartConfig.enabled;
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

function compareVersions(left, right) {
  const leftParts = String(left || '0').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right || '0').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
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

function loadInstalledReleaseManifest() {
  if (!fs.existsSync(installedReleaseManifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(installedReleaseManifestPath, 'utf8'));
  } catch (error) {
    log.warn('Failed to read installed release manifest', error);
    return null;
  }
}

function saveInstalledReleaseManifest(payload) {
  fs.mkdirSync(path.dirname(installedReleaseManifestPath), { recursive: true });
  fs.writeFileSync(installedReleaseManifestPath, JSON.stringify(payload, null, 2));
}

function archiveReleasePackage(sourcePath, release) {
  if (!sourcePath || !fs.existsSync(sourcePath) || !release || !release.fileName) {
    return null;
  }
  fs.mkdirSync(releaseArchiveRoot, { recursive: true });
  const archiveName = `${release.version || 'unknown'}__${release.fileName}`;
  const archivePath = path.join(releaseArchiveRoot, archiveName);
  if (!fs.existsSync(archivePath)) {
    fs.copyFileSync(sourcePath, archivePath);
  }
  return archivePath;
}

function launchDetachedInstaller(kind, targetPath, silentArgs) {
  if (kind === 'msi') {
    const child = spawn(
      'msiexec',
      ['/i', targetPath, ...(silentArgs || ['/quiet', '/qn', '/norestart'])],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    child.unref();
    return;
  }

  const child = spawn(targetPath, silentArgs || ['/S'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function writePendingUpdateMarker(release, fromVersion, rollbackRelease) {
  fs.writeFileSync(
    pendingUpdateMarkerPath,
    JSON.stringify(
      {
        fileName: release.fileName,
        targetVersion: release.version || null,
        fromVersion,
        cachedPackagePath: path.join(installerCacheRoot, release.fileName),
        kind: release.kind || null,
        silentArgs: release.silentArgs || null,
        rollbackRelease: rollbackRelease || null,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function recoverPendingUpdateMarker() {
  if (!fs.existsSync(pendingUpdateMarkerPath)) {
    return;
  }

  let keepMarker = false;
  try {
    const marker = JSON.parse(fs.readFileSync(pendingUpdateMarkerPath, 'utf8'));
    const currentVersion = app.getVersion();
    const targetVersion = marker.targetVersion || null;
    const fromVersion = marker.fromVersion || 'unknown';

    if (marker.rollbackAttempted) {
      if (compareVersions(currentVersion, marker.rollbackTargetVersion || fromVersion) === 0) {
        reportInstallStatus('rollback-confirmed', `${marker.fileName} rolled back to ${currentVersion}`);
      } else {
        reportInstallStatus(
          'rollback-failed',
          `${marker.fileName} rollback did not complete. Current version ${currentVersion}, expected ${marker.rollbackTargetVersion || fromVersion}`
        );
      }
      return;
    }

    if (targetVersion && compareVersions(currentVersion, targetVersion) >= 0) {
      const archivedPath = archiveReleasePackage(marker.cachedPackagePath, {
        fileName: marker.fileName,
        version: targetVersion,
      });
      saveInstalledReleaseManifest({
        version: currentVersion,
        fileName: marker.fileName,
        kind: marker.kind || path.extname(marker.fileName).slice(1).toLowerCase(),
        silentArgs: marker.silentArgs || null,
        packagePath: archivedPath,
        updatedAt: new Date().toISOString(),
      });
      reportInstallStatus('update-confirmed', `${marker.fileName} applied, current version ${currentVersion}`);
      return;
    }

    if (compareVersions(currentVersion, fromVersion) === 0) {
      reportInstallStatus(
        'update-failed',
        `${marker.fileName} did not complete. Current version ${currentVersion}, expected ${targetVersion || 'unknown'}, previous ${fromVersion}`
      );
      return;
    }

    const rollbackRelease = marker.rollbackRelease;
    if (
      rollbackRelease &&
      rollbackRelease.packagePath &&
      fs.existsSync(rollbackRelease.packagePath)
    ) {
      fs.writeFileSync(
        pendingUpdateMarkerPath,
        JSON.stringify(
          {
            ...marker,
            rollbackAttempted: true,
            rollbackTargetVersion: rollbackRelease.version || fromVersion,
            rollbackStartedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );
      keepMarker = true;
      reportInstallStatus('rollback-started', `${rollbackRelease.fileName} -> ${rollbackRelease.version || fromVersion}`);
      launchDetachedInstaller(rollbackRelease.kind, rollbackRelease.packagePath, rollbackRelease.silentArgs);
      setTimeout(() => {
        app.quit();
      }, 1500);
      return;
    }

    reportInstallStatus(
      'update-failed',
      `${marker.fileName} failed and no rollback package is available. Current version ${currentVersion}`
    );
  } catch (error) {
    log.warn('Failed to recover pending update marker', error);
  } finally {
    if (!keepMarker && fs.existsSync(pendingUpdateMarkerPath)) {
      fs.rmSync(pendingUpdateMarkerPath, { force: true });
    }
  }
}


async function installPackage(installer) {
  if (!installer || !installer.src || path.extname(installer.fileName || '').toLowerCase() !== '.msi') {
    throw new Error('Invalid MSI installer payload');
  }

  if (!isAllowedDownloadUrl(installer.src)) {
    throw new Error(`Blocked non-whitelisted installer url: ${installer.src}`);
  }

  const softwareName = installer.productName || path.basename(installer.fileName, '.msi');
  const beforeCheck = await checkEnvironmentDetailed(softwareName);
  if (beforeCheck.installed) {
    reportInstallStatus('skipped', `${softwareName} already installed`);
    await sendEnvironmentReport(softwareName);
    return;
  }

  const targetPath = path.join(installerCacheRoot, installer.fileName);
  enforceCacheQuota();
  reportInstallStatus('downloading', installer.fileName);
  await downloadToPath(installer.src, targetPath, {
    expectedSize: installer.size,
    scope: 'installer',
    fileName: installer.fileName,
  });

  if (installer.sha256 && await sha256File(targetPath) !== installer.sha256) {
    fs.rmSync(targetPath, { force: true });
    throw new Error(`Installer sha256 mismatch: ${installer.fileName}`);
  }

  if (installer.md5 && await md5File(targetPath) !== installer.md5) {
    fs.rmSync(targetPath, { force: true });
    throw new Error(`Installer md5 mismatch: ${installer.fileName}`);
  }

  reportInstallStatus('installing', installer.fileName);
  await new Promise((resolve, reject) => {
    execFile('msiexec', ['/i', targetPath, '/quiet', '/qn', '/norestart'], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const afterCheck = await checkEnvironmentDetailed(softwareName);
  if (!afterCheck.installed) {
    throw new Error(`Installer finished but ${softwareName} was not detected afterwards`);
  }

  reportInstallStatus('installed', `${installer.fileName} verified`);
  await sendEnvironmentReport(softwareName);
}

async function applyClientUpdate(release) {
  if (!release || !release.src || !release.fileName) {
    throw new Error('Invalid client release payload');
  }
  if (!isAllowedDownloadUrl(release.src)) {
    throw new Error(`Blocked non-whitelisted release url: ${release.src}`);
  }

  const currentVersion = app.getVersion();
  if (release.version && compareVersions(release.version, currentVersion) <= 0) {
    reportInstallStatus('skipped', `Client ${currentVersion} is already up to date`);
    return;
  }

  const targetPath = path.join(installerCacheRoot, release.fileName);
  enforceCacheQuota();
  reportInstallStatus('updating', release.fileName);
  await downloadToPath(release.src, targetPath, {
    expectedSize: release.size,
    scope: 'release',
    fileName: release.fileName,
  });

  if (release.sha256 && await sha256File(targetPath) !== release.sha256) {
    fs.rmSync(targetPath, { force: true });
    throw new Error(`Release sha256 mismatch: ${release.fileName}`);
  }

  if (release.md5 && await md5File(targetPath) !== release.md5) {
    fs.rmSync(targetPath, { force: true });
    throw new Error(`Release md5 mismatch: ${release.fileName}`);
  }

  const installedRelease = loadInstalledReleaseManifest();
  const rollbackRelease = installedRelease && installedRelease.packagePath && fs.existsSync(installedRelease.packagePath)
    ? installedRelease
    : null;
  writePendingUpdateMarker(release, currentVersion, rollbackRelease);

  try {
    launchDetachedInstaller(release.kind, targetPath, release.silentArgs);
  } catch (error) {
    fs.rmSync(pendingUpdateMarkerPath, { force: true });
    throw error;
  }

  reportInstallStatus('updated', `${release.fileName} launched from ${currentVersion} to ${release.version || 'unknown'}`);
  setTimeout(() => {
    app.quit();
  }, 1500);
}

async function applyPlaylist(payload) {
  const applyToken = ++playlistApplyToken;
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

    log.info('Applying playlist payload', {
      mode,
      itemCount: resolved.length,
      applyStrategy: payload.applyStrategy || 'immediate',
      incremental: false,
    });

    currentPlaybackState = {
      mode,
      applyStrategy: payload.applyStrategy || 'immediate',
      items: [...resolved],
    };
    persistPlaybackSnapshot();
    sendPlaylist();
    sendStatus({ playlist: `ready:${resolved.length}`, mode });
  };

  for (const item of items) {
    try {
      if (item?.type === 'folder' && item?.path) {
        const folderEntries = Array.isArray(item.entries) ? item.entries : [];
        const resolvedEntries = [];
        for (const entry of folderEntries) {
          try {
            const cachedEntry = await cacheMediaItem(entry);
            if (cachedEntry) {
              resolvedEntries.push({
                ...cachedEntry,
                ...(typeof entry.durationMs === 'number' ? { durationMs: entry.durationMs } : {}),
              });
            }
          } catch (error) {
            log.warn('Failed to cache folder entry', {
              folderPath: item.path,
              fileName: entry?.fileName || entry?.path || null,
              message: error?.message || String(error),
            });
          }
        }
        if (!resolvedEntries.length) {
          await mediaManager.syncStagedFolderToLocalLibrary(item.path);
        }
        resolved.push({
          type: 'folder',
          path: String(item.path),
          folderPlayMode: String(item.folderPlayMode || 'sequence').toLowerCase() === 'random' ? 'random' : 'sequence',
          ...(resolvedEntries.length ? { entries: resolvedEntries } : {}),
          ...(typeof item.durationMs === 'number' ? { durationMs: item.durationMs } : {}),
        });
        continue;
      }
      const cached = await cacheMediaItem(item);
      if (cached) {
        resolved.push(cached);
      }
    } catch (error) {
      log.warn('Failed to cache media item', error);
    }
  }

  if (playlistApplyToken !== applyToken) {
    return;
  }

  if (resolved.length === 0) {
    log.warn('No playable media resolved from playlist payload', {
      itemCount: items.length,
      machineId,
    });
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

function createDiscoverySocket() {
  udpSocket = dgram.createSocket('udp4');

  udpSocket.on('message', (msg, rinfo) => {
    try {
      const payload = JSON.parse(msg.toString());
      if (payload.type !== 'SERVER_ACK') {
        return;
      }

      serverInfo = {
        serverIp: payload.serverIp || rinfo.address,
        wsPort: payload.wsPort || DEFAULT_WS_PORT,
        httpPort: payload.httpPort || DEFAULT_HTTP_PORT,
        approved: Boolean(payload.approved),
      };
      pendingPairingCode = payload.pairingCode || null;

      sendStatus({
        discovery: 'server-found',
        approved: serverInfo.approved,
        pairingCode: pendingPairingCode,
      });
      logStructured('Discovery ack received', serverInfo);

      if (serverInfo.approved && !hasReusableWebSocket(serverInfo)) {
        connectWebSocket();
      }
    } catch (error) {
      log.warn('Failed to parse UDP ack', error);
    }
  });

  udpSocket.bind(() => {
    udpSocket.setBroadcast(true);
    broadcastDiscovery();
    discoveryTimer = setInterval(broadcastDiscovery, DISCOVERY_INTERVAL_MS);
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
  logStructured('Command received', {
    command: payload.command,
    data: payload.data || null,
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
    logStructured('WebSocket opened', {
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
        logStructured('WebSocket auth ok', payload);
        pendingPairingCode = null;
        sendStatus({ auth: 'ok', pairingCode: null });
        flushPendingStatusReports();
        sendEnvironmentReport('VLC').catch((error) => log.warn('Failed to send initial VLC environment report', error));
        fetchCurrentPlaylist().catch((error) => log.warn('Failed to sync playlist', error));
        return;
      }
      if (payload.type === 'AUTH_REJECTED') {
        logStructured('WebSocket auth rejected', payload, 'warn');
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
    logStructured('WebSocket closed', {
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
  clearInterval(discoveryTimer);
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
  log.info(`Client log file: ${log.transports.file.getFile().path}`);
  createDiscoverySocket();
  scheduleNightlyRefresh();
  sendStatus({ discovery: 'searching', ws: 'idle', mediaLibraryPath: localMediaLibraryRoot });
});

ipcMain.on('player:ready', () => {
  logStructured('Renderer ready');
  sendPlaylist();
  sendStatus({ mediaLibraryPath: localMediaLibraryRoot });
});

ipcMain.on('player:log', (_event, payload) => {
  logStructured('Renderer event', payload || {});
  sendWsJson({
    type: 'PLAYER_LOG',
    eventType: payload?.type || null,
    payload: payload || {},
  });
});

ipcMain.on('player:error', (_event, error) => {
  logStructured('Player reported error', error || {}, 'warn');
  sendWsJson({
    type: 'PLAYER_ERROR',
    ...error,
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
