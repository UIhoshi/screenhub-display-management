function createMediaManager(deps) {
  const {
    fs,
    path,
    crypto,
    axios,
    log,
    pathToFileURL,
    getLocalMediaLibraryRoot,
    sharedMediaStagingRoot,
    cacheRoot,
    installerCacheRoot,
    reportDownloadStatus,
    isAllowedDownloadUrl,
    maxCacheQuotaBytes,
    downloadRetryCount,
    downloadStatusIntervalMs,
  } = deps;

  function sha256File(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  function md5File(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  async function syncStagedAssetToLocalLibrary(item) {
    const relativePath = String(item?.pushedRelativePath || '').trim();
    if (!relativePath) {
      return null;
    }

    const segments = relativePath.split(/[\\/]+/).filter(Boolean);
    const stagingPath = path.join(sharedMediaStagingRoot, ...segments);
    const localPath = path.join(getLocalMediaLibraryRoot(), ...segments);

    try {
      await fs.promises.access(stagingPath, fs.constants.F_OK);
    } catch (_error) {
      return null;
    }

    const stagingStats = await fs.promises.stat(stagingPath);
    if (item.size && stagingStats.size !== Number(item.size)) {
      throw new Error(`Staged media asset is incomplete: ${relativePath}`);
    }

    if (item.sha256) {
      const stagedHash = await sha256File(stagingPath);
      if (stagedHash !== item.sha256) {
        throw new Error(`Staged media hash mismatch: ${relativePath}`);
      }
    }

    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
    await fs.promises.copyFile(stagingPath, localPath);
    return localPath;
  }

  async function syncStagedFolderToLocalLibrary(relativeFolderPath) {
    const normalizedRelativePath = String(relativeFolderPath || '').split(/[\\/]+/).filter(Boolean).join(path.sep);
    if (!normalizedRelativePath) {
      return null;
    }

    const stagingRoot = path.join(sharedMediaStagingRoot, normalizedRelativePath);
    const localRoot = path.join(getLocalMediaLibraryRoot(), normalizedRelativePath);

    try {
      const stagingStats = await fs.promises.stat(stagingRoot);
      if (!stagingStats.isDirectory()) {
        return null;
      }
    } catch (_error) {
      return null;
    }

    const syncDirectory = async (sourceDir, targetDir) => {
      await fs.promises.mkdir(targetDir, { recursive: true });
      const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
      for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
          await syncDirectory(sourcePath, targetPath);
          continue;
        }

        let shouldCopy = true;
        try {
          const [sourceStats, targetStats] = await Promise.all([
            fs.promises.stat(sourcePath),
            fs.promises.stat(targetPath),
          ]);
          shouldCopy = sourceStats.size !== targetStats.size || sourceStats.mtimeMs > targetStats.mtimeMs;
        } catch (_error) {
          shouldCopy = true;
        }

        if (shouldCopy) {
          await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.promises.copyFile(sourcePath, targetPath);
        }
      }
    };

    await syncDirectory(stagingRoot, localRoot);
    return localRoot;
  }

  function collectCacheEntries() {
    const roots = [cacheRoot, installerCacheRoot];
    return roots.flatMap((rootPath) => {
      if (!fs.existsSync(rootPath)) {
        return [];
      }
      return fs.readdirSync(rootPath, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const fullPath = path.join(rootPath, entry.name);
          const stats = fs.statSync(fullPath);
          return {
            fullPath,
            size: stats.size,
            mtime: stats.mtimeMs,
          };
        });
    });
  }

  function enforceCacheQuota() {
    try {
      const files = collectCacheEntries().sort((a, b) => a.mtime - b.mtime);
      let currentTotalSize = files.reduce((sum, file) => sum + file.size, 0);
      while (currentTotalSize > maxCacheQuotaBytes && files.length > 0) {
        const oldest = files.shift();
        fs.rmSync(oldest.fullPath, { force: true });
        currentTotalSize -= oldest.size;
        log.info(`Disk quota exceeded, deleted: ${oldest.fullPath}`);
      }
    } catch (error) {
      log.error('Quota enforcement failed', error);
    }
  }

  function parseContentRange(headerValue) {
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(headerValue || '').trim());
    if (!match) {
      return null;
    }
    return {
      start: Number(match[1]),
      end: Number(match[2]),
      total: Number(match[3]),
    };
  }

  async function downloadToPath(rawUrl, targetPath, options = {}) {
    let lastError = null;
    let forceFreshDownload = false;
    const scope = options.scope || 'media';
    const fileName = options.fileName || path.basename(targetPath);

    for (let attempt = 1; attempt <= downloadRetryCount; attempt += 1) {
      try {
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        if (forceFreshDownload && fs.existsSync(targetPath)) {
          await fs.promises.rm(targetPath, { force: true });
        }

        const existingSize = !forceFreshDownload && fs.existsSync(targetPath)
          ? fs.statSync(targetPath).size
          : 0;
        const headers = existingSize > 0 ? { Range: `bytes=${existingSize}-` } : undefined;
        const response = await axios.get(rawUrl, {
          responseType: 'stream',
          timeout: 30000,
          headers,
          validateStatus: (status) => (status >= 200 && status < 300) || status === 206,
        });

        const shouldAppend = existingSize > 0 && response.status === 206;
        const contentRange = parseContentRange(response.headers['content-range']);
        const contentLength = Number(response.headers['content-length']) || 0;
        const expectedSize = Number(options.expectedSize) || (contentRange ? contentRange.total : null) || (existingSize + contentLength);

        if (existingSize > 0 && response.status === 206) {
          if (!contentRange || contentRange.start !== existingSize) {
            const error = new Error(`Resume content-range mismatch for ${path.basename(targetPath)}`);
            error.code = 'RESUME_MISMATCH';
            throw error;
          }
        }

        let downloadedBytes = shouldAppend ? existingSize : 0;
        const startedAt = new Date().toISOString();
        let lastSampleAt = Date.now();
        let bytesSinceLastReport = 0;
        let lastReportedAt = 0;

        reportDownloadStatus(scope, {
          state: attempt > 1 ? 'retrying' : 'downloading',
          fileName,
          downloadedBytes,
          totalBytes: expectedSize || null,
          percent: expectedSize ? Number(((downloadedBytes / expectedSize) * 100).toFixed(1)) : null,
          bytesPerSecond: null,
          startedAt,
          error: null,
        });

        await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(targetPath, { flags: shouldAppend ? 'a' : 'w' });
          let settled = false;

          const fail = (error) => {
            if (settled) {
              return;
            }
            settled = true;
            response.data.destroy();
            writer.destroy();
            reject(error);
          };

          response.data.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            bytesSinceLastReport += chunk.length;
            const now = Date.now();
            if (now - lastReportedAt >= downloadStatusIntervalMs) {
              const elapsedSeconds = Math.max((now - lastSampleAt) / 1000, 0.1);
              reportDownloadStatus(scope, {
                state: 'downloading',
                fileName,
                downloadedBytes,
                totalBytes: expectedSize || null,
                percent: expectedSize ? Number(((downloadedBytes / expectedSize) * 100).toFixed(1)) : null,
                bytesPerSecond: Number((bytesSinceLastReport / elapsedSeconds).toFixed(0)),
                startedAt,
                error: null,
              });
              lastReportedAt = now;
              lastSampleAt = now;
              bytesSinceLastReport = 0;
            }
          });
          response.data.on('error', fail);
          writer.on('error', fail);
          writer.on('finish', () => {
            if (settled) {
              return;
            }
            settled = true;
            resolve();
          });
          response.data.pipe(writer);
        });

        const finalSize = fs.statSync(targetPath).size;
        if (expectedSize && finalSize !== expectedSize) {
          const error = new Error(`Downloaded size mismatch for ${path.basename(targetPath)}: ${finalSize}/${expectedSize}`);
          error.code = 'SIZE_MISMATCH';
          throw error;
        }

        reportDownloadStatus(scope, {
          state: 'completed',
          fileName,
          downloadedBytes: finalSize,
          totalBytes: expectedSize || finalSize,
          percent: 100,
          bytesPerSecond: null,
          error: null,
        });
        return;
      } catch (error) {
        lastError = error;
        reportDownloadStatus(scope, {
          state: attempt < downloadRetryCount ? 'retrying' : 'failed',
          fileName,
          error: error.message,
        });
        if (['RESUME_MISMATCH', 'SIZE_MISMATCH'].includes(error.code)) {
          forceFreshDownload = true;
        }
        if (attempt < downloadRetryCount) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
    }

    throw lastError;
  }

  async function cacheMediaItem(item) {
    if (!item || !item.src) {
      return null;
    }

    if (item.pushedRelativePath) {
      let localPushedPath = path.join(getLocalMediaLibraryRoot(), ...String(item.pushedRelativePath).split(/[\\/]+/));
      if (fs.existsSync(localPushedPath)) {
        const localStats = fs.statSync(localPushedPath);
        if (!item.size || localStats.size === Number(item.size)) {
          return {
            type: item.type,
            src: pathToFileURL(localPushedPath).href,
            originalSrc: item.src,
            md5: item.md5,
            ...(typeof item.durationMs === 'number' && item.durationMs > 0 ? { durationMs: item.durationMs } : {}),
          };
        }
      }

      const syncedPath = await syncStagedAssetToLocalLibrary(item);
      if (syncedPath && fs.existsSync(syncedPath)) {
        localPushedPath = syncedPath;
        return {
          type: item.type,
          src: pathToFileURL(localPushedPath).href,
          originalSrc: item.src,
          md5: item.md5,
          ...(typeof item.durationMs === 'number' && item.durationMs > 0 ? { durationMs: item.durationMs } : {}),
        };
      }
      log.warn(`Falling back to HTTP cache because staged media is unavailable: ${item.pushedRelativePath}`);
    }

    if (!isAllowedDownloadUrl(item.src)) {
      throw new Error(`Blocked non-whitelisted media url: ${item.src}`);
    }

    enforceCacheQuota();
    fs.mkdirSync(cacheRoot, { recursive: true });
    const extension = path.extname(new URL(item.src).pathname) || '.bin';
    const cacheName = item.sha256 ? `${item.sha256}${extension}` : path.basename(new URL(item.src).pathname);
    const cachePath = path.join(cacheRoot, cacheName);

    if (!fs.existsSync(cachePath)) {
      await downloadToPath(item.src, cachePath, {
        expectedSize: item.size,
        scope: 'media',
        fileName: item.fileName || path.basename(new URL(item.src).pathname),
      });
    }

    if (item.sha256) {
      const actualHash = await sha256File(cachePath);
      if (actualHash !== item.sha256) {
        fs.rmSync(cachePath, { force: true });
        throw new Error(`Media hash mismatch: ${item.src}`);
      }
    }

    if (item.md5) {
      const actualMd5 = await md5File(cachePath);
      if (actualMd5 !== item.md5) {
        fs.rmSync(cachePath, { force: true });
        throw new Error(`Media md5 mismatch: ${item.src}`);
      }
    }

    return {
      type: item.type,
      src: pathToFileURL(cachePath).href,
      originalSrc: item.src,
      md5: item.md5,
      ...(typeof item.durationMs === 'number' && item.durationMs > 0 ? { durationMs: item.durationMs } : {}),
    };
  }

  return {
    syncStagedAssetToLocalLibrary,
    syncStagedFolderToLocalLibrary,
    sha256File,
    md5File,
    enforceCacheQuota,
    downloadToPath,
    cacheMediaItem,
  };
}

module.exports = {
  createMediaManager,
};
