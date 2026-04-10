function registerPlaylistRoutes(server, options) {
  const { app } = options;

  app.get('/api/playlist', (req, res) => {
    res.json(server.getResolvedPlaylist(req.query.machineId));
  });

  app.post('/api/playlist/demo', (req, res) => {
    server.savePlaylist({
      updatedAt: new Date().toISOString(),
      mode: 'loop',
      items: [
        { type: 'image', path: 'brand-panel.svg', durationMs: 6000 },
        { type: 'image', path: 'ops-panel.svg', durationMs: 6000 },
      ],
    });

    const playlist = server.getResolvedPlaylist();
    server.broadcastCommand('SET_PLAYLIST', playlist);
    res.json({ success: true, playlist });
  });

  app.post('/api/playlist/save', async (req, res) => {
    const { machineId = null, mode = 'loop', items = [] } = req.body || {};
    try {
      const resolved = await server.saveAndDispatchPlaylist(machineId, { mode, items });
      res.json({ success: true, playlist: resolved });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/playlist/dispatch', async (req, res) => {
    const { machineIds = [], mode = 'loop', items = [] } = req.body || {};
    const uniqueMachineIds = Array.from(new Set((Array.isArray(machineIds) ? machineIds : []).filter(Boolean)));
    if (!uniqueMachineIds.length) {
      res.status(400).json({ success: false, error: 'machineIds is required' });
      return;
    }

    try {
      const results = [];
      for (const machineId of uniqueMachineIds) {
        if (!server.approvedDevices.has(machineId)) {
          throw new Error(`Device is not approved: ${machineId}`);
        }
        results.push({
          machineId,
          playlist: await server.saveAndDispatchPlaylist(machineId, { mode, items }),
        });
      }
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = registerPlaylistRoutes;
