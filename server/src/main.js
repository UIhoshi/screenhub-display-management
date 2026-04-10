const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { app, Menu, Tray, nativeImage, shell, dialog } = require('electron');
const log = require('electron-log');
const loadLocalEnv = require('./load-env');

loadLocalEnv();

const AdServer = require('./backend/server');

let tray = null;
let serverInstance = null;
const AUTO_START_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const AUTO_START_NAME = 'AdvertisingScreenServer';
const serverStorageRoot = process.env.AD_STORAGE_DIR
  ? path.resolve(process.env.AD_STORAGE_DIR)
  : app.isPackaged
    ? path.join(app.getPath('userData'), 'storage')
    : path.join(__dirname, '..', 'storage');
const serverConfigPath = path.join(serverStorageRoot, 'server-config.json');
const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

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
  log.transports.file.resolvePathFn = () => path.join(logDir, 'server-main.log');
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

configureLogging();

function ensureServerStorageRoot() {
  fs.mkdirSync(serverStorageRoot, { recursive: true });
}

function loadServerConfig() {
  try {
    ensureServerStorageRoot();
    if (!fs.existsSync(serverConfigPath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(serverConfigPath, 'utf8')) || {};
  } catch (_error) {
    return {};
  }
}

function saveServerConfig(config) {
  ensureServerStorageRoot();
  fs.writeFileSync(serverConfigPath, JSON.stringify(config, null, 2));
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

function updateServerAutoStartConfig(enabled) {
  const config = loadServerConfig();
  config.autoStartConfig = {
    hasAsked: true,
    enabled: Boolean(enabled),
    updatedAt: new Date().toISOString(),
  };
  saveServerConfig(config);
  return config.autoStartConfig;
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

function getServerLaunchCommand() {
  if (app.isPackaged) {
    return `"${process.execPath}"`;
  }
  return `cmd.exe /c "cd /d ""${path.join(__dirname, '..')}"" && npm.cmd start"`;
}

async function ensureAutoStart() {
  const command = getServerLaunchCommand();
  try {
    await execFileAsync('reg', ['add', AUTO_START_REG_PATH, '/v', AUTO_START_NAME, '/t', 'REG_SZ', '/d', command, '/f']);
    log.info('Server auto start registry entry ensured');
  } catch (result) {
    log.warn('Failed to ensure server auto start', {
      message: result.error.message,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
}

async function cleanupAutoStart() {
  try {
    await execFileAsync('reg', ['delete', AUTO_START_REG_PATH, '/v', AUTO_START_NAME, '/f']);
    log.info('Server auto start registry entry removed');
  } catch (result) {
    log.info('Skipped removing server auto start registry entry', {
      message: result.error.message,
    });
  }
}

function resolveAutoStartConsent() {
  const config = loadServerConfig();
  const autoStartConfig = normalizeAutoStartConfig(config);
  if (!autoStartConfig.hasAsked) {
    updateServerAutoStartConfig(false);
    return false;
  }
  return autoStartConfig.enabled;
}

process.on('uncaughtException', (error) => {
  logUnhandledError('Server uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  logUnhandledError('Server unhandledRejection', reason);
});

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Advertising Screen Server');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Advertising Screen Server', enabled: false },
      { type: 'separator' },
      {
        label: 'Open Admin Console',
        click: () => shell.openExternal('http://localhost:3000'),
      },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ])
  );
}

function openAdminConsole() {
  shell.openExternal('http://127.0.0.1:3000');
}

app.on('second-instance', () => {
  log.info('Second server instance blocked, redirecting to existing instance');
  openAdminConsole();
});

app.whenReady()
  .then(async () => {
    if (app.isPackaged) {
      const autoStartEnabled = resolveAutoStartConsent();
      if (autoStartEnabled) {
        await ensureAutoStart();
      }
    }
    serverInstance = new AdServer();
    serverInstance.start();
    createTray();
    openAdminConsole();
    log.info(`Server log file: ${log.transports.file.getFile().path}`);
    log.info('Server tray wrapper started');
  })
  .catch((error) => {
    log.error('Server startup failed', error);
    dialog.showErrorBox(
      'Advertising Screen Server Startup Failed',
      `${error.message}\n\n请检查安装目录中的 .env（开发环境为 server/.env）以及可写目录权限。`
    );
    app.exit(1);
  });

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  if (serverInstance) {
    serverInstance.stop();
  }
});

app.on('render-process-gone', (_event, webContents, details) => {
  log.error('Server renderer process gone', {
    reason: details.reason,
    exitCode: details.exitCode,
    url: webContents.getURL(),
  });
});
