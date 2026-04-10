# L2_CORE_LOGIC_UPGRADE (逻辑与性能模块)

本模块负责修复系统的核心通信与分发缺陷。

---

## 📈 性能升级任务 (L3 细节)
### 1. 突破内网传输瓶颈
- **现状**: 目前使用同步 `copyFileSync`，导致大文件分发时 Node.js 主线程阻塞，心跳包延迟，表象为“限速 48KB/s”。
- **方案**: 实施流式非阻塞 I/O 改造。
- **关联函数**: `L3_SURGICAL_MAP_ATOMIC.md` -> [copyAssetToClient]

### 2. 文件夹下发与动态播放逻辑 (Folder Dispatch & Dynamic Playback)

**纠偏声明**：目前的重构逻辑严重错误！后端不应在 `expandPlaylistItems` 中将文件夹展开为碎文件。

**重构指令：**

#### A. 服务端：保持“容器性” (Protocol Integrity)
- **禁止**：禁止在下发 `SET_PLAYLIST` 前将文件夹条目扁平化。
- **要**：将文件夹作为一个完整的播放项下发。
  - Payload 示例：`{ type: 'folder', path: 'item/桌面背景', durationMs: 5000, strategy: 'sequence' }`。
- **职责**：服务端只负责同步文件夹内的物理文件到客户端的中转目录，不负责拆解播放逻辑。

#### B. 客户端：实现“目录感知” (Directory Awareness)
- **定位**：`client/src/renderer/index.html` -> `playCurrent()`。
- **逻辑分支**：
  1. 如果 `item.type === 'folder'`，客户端**不应**直接播放。
  2. 客户端应根据 `item.path` 定位到本地素材库对应的目录。
  3. 客户端**内部维护一个子播放列表**，递归该目录下所有媒体文件并执行播放。
- **优势**：
  - **动态性**：实现真正的“文件夹播放”。只需往该文件夹添加文件，客户端无需重新下发配置即可自动感知并播放。
  - **性能**：大幅减小 WS 传输的 Payload 体积。

---
## 🔗 关联 L3 核心函数修改
- **[L3_SURGICAL_MAP_ATOMIC.md](./L3_SURGICAL_MAP_ATOMIC.md)**：查看 `playCurrent` 和 `normalizePlaylistDocument` 的最新修改指令。


### 3. WebSocket 差量推送 (Patching)
- **方案**: 在 `ws-gateway.js` 增加 `DEVICE_PATCH` 事件，只同步变化的进度数值。
- **关联函数**: `L3_SURGICAL_MAP_ATOMIC.md` -> [broadcastStatusChange]

---

## 🔗 修改入口
- 立即查看 **[L3_SURGICAL_MAP_ATOMIC.md](./L3_SURGICAL_MAP_ATOMIC.md)** 获取代码级指令。
