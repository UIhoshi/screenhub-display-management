# 04_SURGICAL_REFACTORING_MAP (L4 - 施工层)

这是为工程助手提供的**“手术级”**修改对照表。请确保在修改前已经备份对应文件。

## 1. 下载限速与 I/O 异步化
- **目标文件**: `server/src/backend/server.js`
- **目标函数**: `copyAssetToClient(machineId, fileName)`
- **修改内容**:
  - 删除 `fs.copyFileSync`。
  - 使用 `fs.createReadStream` + `fs.createWriteStream` + `pipeline` 实现流式异步。
  - 增加对 `targetPath` 的写入确认日志。

## 2. 素材下发逻辑修正 (文件夹封装)
- **目标文件 1 (Admin UI)**: `server/src/admin-ui/index.html`
- **目标函数**: `addCurrentFolderToPlaylist()`
  - 修改逻辑：不再展开文件，只 push 文件夹路径。
- **目标文件 2 (Server)**: `server/src/backend/server.js`
- **目标函数**: `normalizePlaylistDocument(payload)`
  - 增加逻辑：检测 `item.type === 'folder'`，自动调用 `getAssetCatalog` 执行服务器端自动展开。

## 3. 监控界面性能提升 (局部 DOM 更新)
- **目标文件**: `server/src/admin-ui/index.html`
- **目标函数 1**: `renderDevices(devices)`
  - 重构为：`if(cardExists) { updateMetrics(card, device) } else { createCard() }`。
- **目标函数 2**: `renderDownloadStatus(device)`
  - 修改 UI 结构：使用 `<meter>` 或 `div.progress`，移除图片预览。

## 4. 实时进度推送
- **目标文件**: `server/src/backend/ws-gateway.js`
- **新增逻辑**: 
  - 在 `HEARTBEAT / DOWNLOAD_STATUS` 处理器最后，增加 `broadcastStatusChange(machineId, status)`。
- **前端配合**: 在 `initWebSocket()` (Admin UI 端) 增加对推送消息的局部刷新调用。

## 5. 文字显示与多语言
- **目标文件 1 (Client Renderer)**: `client/src/renderer/index.html`
- **目标容器**: `#app` 内新增 `<div id="text-container"></div>`。
- **目标函数**: `playCurrent()`
  - 增加文本读取与渲染逻辑。

---
**执行准则**：
1. **精准定位**：优先查找函数名。
2. **渐进提交**：完成一个小节的重写后立即保存并测试连通性。
3. **安全回退**：如遇逻辑冲突，保留原有参数接口，只重构函数内部逻辑。
