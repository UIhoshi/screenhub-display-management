function createUpdater(deps) {
  const {
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
  } = deps;

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

  async function verifyPackageChecksums(targetPath, pkg, label) {
    if (pkg.sha256 && await sha256File(targetPath) !== pkg.sha256) {
      fs.rmSync(targetPath, { force: true });
      throw new Error(`${label} sha256 mismatch: ${pkg.fileName}`);
    }
    if (pkg.md5 && await md5File(targetPath) !== pkg.md5) {
      fs.rmSync(targetPath, { force: true });
      throw new Error(`${label} md5 mismatch: ${pkg.fileName}`);
    }
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
    const command = kind === 'msi' ? 'msiexec' : targetPath;
    const args = kind === 'msi'
      ? ['/i', targetPath, ...(silentArgs || ['/quiet', '/qn', '/norestart'])]
      : (silentArgs || ['/S']);

    const child = spawn(command, args, {
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
      if (rollbackRelease && rollbackRelease.packagePath && fs.existsSync(rollbackRelease.packagePath)) {
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

    await verifyPackageChecksums(targetPath, installer, 'Installer');

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

    await verifyPackageChecksums(targetPath, release, 'Release');

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

  return {
    compareVersions,
    loadInstalledReleaseManifest,
    saveInstalledReleaseManifest,
    archiveReleasePackage,
    launchDetachedInstaller,
    writePendingUpdateMarker,
    recoverPendingUpdateMarker,
    installPackage,
    applyClientUpdate,
  };
}

module.exports = {
  createUpdater,
};
