const fs = require('fs');
const path = require('path');

function registerAssetRoutes(server, options) {
  const {
    app,
    mediaRoot,
  } = options;

  app.get('/api/assets', (req, res) => {
    if (String(req.query.flat || '') === '1') {
      res.json(server.getAssetCatalog(req.query.dir || ''));
      return;
    }
    res.json(server.getAssetDirectory(req.query.dir || ''));
  });

  app.delete('/api/assets', (req, res) => {
    try {
      const assetPath = server.normalizeAssetRelativePath(req.query.path || '');
      if (!assetPath) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }

      const filePath = path.join(mediaRoot, assetPath);
      if (!fs.existsSync(filePath)) {
        res.json({ success: true, fileName: assetPath, alreadyMissing: true });
        return;
      }

      const deletedAsset = server.describeAssetFile(assetPath);
      fs.rmSync(filePath, { force: true });
      server.removeAssetReferences(assetPath);
      server.broadcastCommand('PURGE_ASSET', {
        fileName: assetPath,
        md5: deletedAsset.md5,
        sha256: deletedAsset.sha256,
        src: deletedAsset.src,
      });

      res.json({ success: true, fileName: assetPath });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/assets/folders', (req, res) => {
    try {
      const folderPath = server.normalizeAssetDirectory(req.query.path || '');
      if (!folderPath) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }

      const targetDir = path.join(mediaRoot, folderPath);
      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        res.status(404).json({ success: false, error: 'Folder not found' });
        return;
      }

      const assets = server.getAssetCatalog(folderPath);
      assets.forEach((asset) => {
        server.removeAssetReferences(asset.fileName);
        server.broadcastCommand('PURGE_ASSET', {
          fileName: asset.fileName,
          md5: asset.md5,
          sha256: asset.sha256,
          src: asset.src,
        });
      });

      fs.rmSync(targetDir, { recursive: true, force: true });
      res.json({ success: true, path: folderPath });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/assets/folders', (req, res) => {
    try {
      const folderPath = server.normalizeAssetDirectory(req.body?.path || '');
      if (!folderPath) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }

      fs.mkdirSync(path.join(mediaRoot, folderPath), { recursive: true });
      res.json({ success: true, path: folderPath });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/assets/upload', server.assetUpload.array('files'), async (req, res) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) {
        res.status(400).json({ success: false, error: 'files are required' });
        return;
      }

      const relativePaths = Array.isArray(req.body?.relativePath)
        ? req.body.relativePath
        : req.body?.relativePath
          ? [req.body.relativePath]
          : [];
      const baseDir = server.normalizeAssetDirectory(req.body?.baseDir || '');
      const uploadedAssets = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const safeRelativePath = server.buildAssetStoragePath(
          file.originalname,
          relativePaths[index] || file.originalname,
          baseDir
        );
        const targetPath = path.join(mediaRoot, safeRelativePath);
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        try {
          await fs.promises.access(targetPath, fs.constants.F_OK);
        } catch (_error) {
          await fs.promises.copyFile(file.path, targetPath);
        }
        await fs.promises.rm(file.path, { force: true });
        uploadedAssets.push(server.describeAssetFile(safeRelativePath));
      }

      res.json({ success: true, assets: uploadedAssets });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = registerAssetRoutes;
