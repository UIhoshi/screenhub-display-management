function createAutoLaunchManager(deps) {
  const {
    fs,
    path,
    execFile,
    app,
    log,
    controlRoot,
    remoteStartTriggerPath,
    remoteStartWatcherScriptPath,
    autoStartRegPath,
    autoStartName,
    remoteStartTaskName,
    remoteStartWatcherTaskName,
    loadClientConfig,
    updateClientAutoStartConfig,
    baseDir,
  } = deps;

  function normalizeAutoStartConfig(config = {}) {
    const autoStartConfig = config && typeof config.autoStartConfig === 'object'
      ? config.autoStartConfig
      : {};
    return {
      hasAsked: autoStartConfig.hasAsked === true,
      enabled: autoStartConfig.enabled === true,
    };
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
      workdir: path.join(baseDir, '..'),
    };
  }

  function ensureRemoteStartWatcherScript() {
    fs.mkdirSync(controlRoot, { recursive: true });
    const script = [
      'param(',
      '  [string]$TriggerPath,',
      '  [string]$LauncherPath,',
      '  [string]$LauncherArgsJson,',
      '  [string]$WorkingDirectory',
      ')',
      'if (-not (Test-Path -LiteralPath $TriggerPath)) { exit 0 }',
      'try {',
      '  Remove-Item -LiteralPath $TriggerPath -Force -ErrorAction SilentlyContinue',
      '  $launcherArgs = @()',
      '  if ($LauncherArgsJson) {',
      '    $launcherArgs = @(ConvertFrom-Json -InputObject $LauncherArgsJson)',
      '  }',
      '  Start-Process -FilePath $LauncherPath -ArgumentList $launcherArgs -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null',
      '} catch {',
      "  $logPath = Join-Path (Split-Path -Parent $TriggerPath) 'remote-start-watcher-error.log'",
      '  "[$(Get-Date -Format \'yyyy-MM-dd HH:mm:ss\')] $($_.Exception.Message)" | Out-File -FilePath $logPath -Append -Encoding UTF8',
      '}',
    ].join('\r\n');
    fs.writeFileSync(remoteStartWatcherScriptPath, script, 'utf8');
  }

  function execFileAsync(command, args) {
    return new Promise((resolve, reject) => {
      execFile(command, args, (error, stdout, stderr) => {
        if (error) {
          reject({ error, stdout, stderr });
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }

  async function setupAutoLaunch() {
    const exePath = process.execPath.replace(/"/g, '\\"');
    try {
      await execFileAsync('reg', ['add', autoStartRegPath, '/v', autoStartName, '/t', 'REG_SZ', '/d', `"${exePath}"`, '/f']);
      log.info('Auto start registry entry ensured');
    } catch (result) {
      log.warn('Failed to register auto start', result.error);
    }

    const taskCommand = `"${process.execPath}"`;
    try {
      await execFileAsync('schtasks.exe', [
        '/Create',
        '/TN', remoteStartTaskName,
        '/TR', taskCommand,
        '/SC', 'ONCE',
        '/ST', '00:00',
        '/F',
      ]);
      log.info('Remote start scheduled task ensured', {
        taskName: remoteStartTaskName,
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
        '/TN', remoteStartWatcherTaskName,
        '/TR', `powershell.exe ${taskArgs.map((arg) => `"${String(arg).replace(/"/g, '""')}"`).join(' ')}`,
        '/SC', 'MINUTE',
        '/MO', '1',
        '/F',
      ]);
      log.info('Remote start watcher task ensured', {
        taskName: remoteStartWatcherTaskName,
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
        args: ['delete', autoStartRegPath, '/v', autoStartName, '/f'],
      },
      {
        label: 'client remote start scheduled task',
        command: 'schtasks.exe',
        args: ['/Delete', '/TN', remoteStartTaskName, '/F'],
      },
      {
        label: 'client remote start watcher task',
        command: 'schtasks.exe',
        args: ['/Delete', '/TN', remoteStartWatcherTaskName, '/F'],
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

  return {
    normalizeAutoStartConfig,
    getClientLaunchSpec,
    ensureRemoteStartWatcherScript,
    execFileAsync,
    setupAutoLaunch,
    cleanupAutoLaunchArtifacts,
    resolveAutoStartConsent,
  };
}

module.exports = {
  createAutoLaunchManager,
};
