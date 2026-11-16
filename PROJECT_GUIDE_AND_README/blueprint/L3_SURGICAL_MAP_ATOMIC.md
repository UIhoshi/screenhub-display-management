# L3_SURGICAL_MAP_ATOMIC (重构手术指令)

本文件是 Codex/Claude 的直接执行指南。

---

## 🛠️ [新增] 网段主动探测逻辑 (Active HTTP Probing)

### 1. `client/src/main.js` -> `scanLocalNetworkForServer()`
- **目标**: 在 UDP 失效时，通过单播网段扫描寻找服务端。
- **逻辑细节**:
  1. 调用 `resolvePreferredLocalIp()` 获取本机 IP（如 `192.168.10.45`）。
  2. 提取网段前缀（`192.168.10.`）。
  3. 循环 `1` 到 `254`。
  4. 使用 `axios` 或 `http.get` 发送 `http://192.168.10.i:3000/api/client/hello`。
  5. **关键设置**: `timeout: 1000ms`（防止扫描过程过长）。
  6. **控制并发**: 建议每次同时探测 10 个 IP，避免占用本地连接数。
  7. **命中处理**: 只要收到正确的 Server 响应（包含服务器信息），立即调用 `applyManualServerConnection(ip)`。

### 2. `client/src/main.js` -> 启动链路调整
- **修改点**: 在 `createDiscoverySocket()` 启动后，设置一个 10 秒定时器。
- **逻辑**: 如果 10 秒内 `serverEndpoint` 仍为空，且未配置手动 IP，则启动 `scanLocalNetworkForServer()`。

---

## 🛠️ 文件夹下发重构 (Folder Integrity)

### 3. `server/src/backend/server.js` -> `normalizePlaylistDocument(payload)`
- **修改内容**:
  - 遇到目录时，停止递归展开内部文件。
  - 直接保留项：`{ type: 'folder', path: item.path, durationMs: item.durationMs || 5000, folderPlayMode: item.folderPlayMode || 'sequence' }`。

### 4. `client/src/renderer/index.html` -> `playCurrent()`
- **修改内容**:
  - 判断 `if (item.type === 'folder')`。
  - 递归扫描本地 `media-library/${item.path}`。
  - 构造渲染层子播放列表并进入文件夹播放状态机。

---

## 🛠️ 性能与工程化

### 5. `server/src/backend/server.js` -> `copyAssetToClient(machineId, fileName)`
- **修改内容**:
  - 废弃 `fs.copyFileSync`。
  - 实现 `fs.createReadStream(src).pipe(fs.createWriteStream(dest))` 并监听 `finish` 和 `error` 事件。

---
## 🏁 交付验证命令
- 修改完成后，请运行：`npm run build` (需确认已挂接 sync 脚本)。
- 检查 `windows/` 目录下的安装包时间戳是否已更新。
