# Advertising Screen 框架与主入口

## 1. 服务端

### `server/src/main.js`

作用：Electron 外壳启动器，不直接做业务，负责把后台服务包起来。

主函数：

- `resolveWritableLogDir()`
  - 选择日志目录，优先程序目录 `logs/`，失败则回退 `AppData/logs`
- `configureLogging()`
  - 配置 `electron-log`
- `getServerLaunchCommand()`
  - 生成开机自启命令
- `ensureAutoStart()`
  - 写注册表，保证服务端开机启动
- `createTray()`
  - 创建托盘图标和菜单
- `app.whenReady().then(...)`
  - 实例化 `AdServer`
  - 调用 `serverInstance.start()`

### `server/src/backend/server.js`

作用：系统核心后端。现在它主要承担“编排器”职责，不再直接承载全部协议实现。

这里包含：

- Express API
- 素材库管理
- 播放列表管理
- 设备审批与解绑
- 客户端命令下发
- 素材推送与本地库同步控制

核心类：

- `class AdServer`

核心生命周期函数：

- `constructor()`
- `ensureStorage()`
- `initExpress()`
- `initWebSocket()`
- `initUDP()`
- `start()`
- `stop()`

### `server/src/backend/routes/*.js`

作用：拆出 HTTP 路由层，避免 `initExpress()` 继续膨胀。

当前模块：

- [server/src/backend/routes/system.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/server/src/backend/routes/system.js)
- [server/src/backend/routes/assets.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/server/src/backend/routes/assets.js)
- [server/src/backend/routes/playlist.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/server/src/backend/routes/playlist.js)
- [server/src/backend/routes/devices.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/server/src/backend/routes/devices.js)

### `server/src/backend/ws-gateway.js`

作用：独立处理 WebSocket 注册、状态消息、播放器日志与心跳哨兵。

关键点：

- 服务端 PING/PONG 心跳
- 客户端超时踢断
- `REGISTER / HEARTBEAT / DOWNLOAD_STATUS / PLAYER_LOG / PLAYER_ERROR` 处理

### `server/src/backend/udp-discovery.js`

作用：独立处理 UDP 广播发现。

关键点：

- 接收 `DISCOVERY`
- 基于客户端来源 IP 选择同网段 `serverIp`
- 返回 `SERVER_ACK`

## 2. 客户端

### `client/src/main.js`

作用：客户端主进程，是真正的播放器控制核心。当前仍偏重，但已经开始拆领域模块。

职责：

- 启动 Electron 播放窗口
- 自动发现服务端
- 建立 WebSocket
- 拉取并应用播放列表
- 从中转目录同步素材到本地素材库
- 向渲染层提供本地素材库目录扫描能力
- 上报心跳/下载状态/错误
- 响应远程命令
- 处理更新、安装、截图、环境检查

关键生命周期入口：

- `app.whenReady().then(...)`
- `createWindow()`
- `createDiscoverySocket()`
- `connectWebSocket()`
- `startHeartbeat()`

### `client/src/media-manager.js`

作用：从 `main.js` 中拆出的素材管理模块。

职责：

- 中转目录到本地素材库同步
- 媒体缓存校验
- 下载重试与断点续传
- 本地缓存配额清理

这是当前客户端“上帝文件拆分”的第一步。

### `client/src/preload.js`

作用：把主进程能力暴露给渲染层。

桥接接口：

- `onPlaylist`
- `onStatus`
- `logEvent`
- `reportError`
- `quitApp`
- `chooseMediaFolder`
- `listMediaFolder`
- `notifyReady`

### `client/src/renderer/index.html`

作用：真正的播放页面。

职责：

- 接收播放列表
- 渲染图片/视频
- 渲染文字素材与文件夹子播放列表
- 控制播放顺序与切换
- 上报 `VIDEO_METADATA` / `VIDEO_CAN_PLAY` / `VIDEO_PLAYING` / 错误
- 非播放态显示调试浮层
- 顶部下载进度条
- 双舞台交叉淡入淡出
- 右上角热区菜单

主要函数：

- `applyPlaybackPayload(payload)`
- `playCurrent()`
- `advancePlaylist()`
- `buildFolderPlaybackState(item)`
- `getCurrentPlayableItem()`
- `clearMedia()`
- `scheduleNext(durationMs)`
- `showStatus(payload)`

### `server/src/admin-ui/index.html`

作用：管理后台页面与分发配置抽屉。

当前抽屉模型：

- 顶部工具区负责：
  - `载入全局模板`
  - `播放模式`
- 底部 Footer 负责：
  - `保存并下发`
- 素材选择区固定读取 `/item` 一级菜单，不再复用素材库当前浏览目录。
- 素材选择区当前是 `75/25` input-group。
- 播放列表编辑区只展示已选条目；文件夹始终作为单个原子行存在。

关键 UI 函数：

- `renderDrawerSourceMenu()`
- `addSelectedDrawerEntry()`
- `syncDrawerSelectionToTargetItem()`
- `setActivePlaylistIndex(index)`
- `renderPlaylistItems(items)`
- `applyConfigToTargets()`

## 3. 数据/控制流

### 服务端到客户端

1. 客户端 UDP 广播发现服务端
2. 服务端返回 `SERVER_ACK`
3. 客户端建立 WebSocket
4. 服务端下发命令：
   - `SET_PLAYLIST`
   - `QUIT_CLIENT`
   - `RELOAD_PLAYER`
   - `CAPTURE_SCREEN`
   - `CHECK_ENV`
   - `INSTALL_PACKAGE`
   - `APPLY_CLIENT_UPDATE`

补充：

- 当播放列表项为 `type: 'folder'` 时，服务端仅下发文件夹路径与策略，不在网络层展开内部文件。
- 当前进一步收紧为：
  - 服务端下发协议中的文件夹项保留 `{ type: 'folder', path, durationMs }`
  - 配置抽屉中的文件夹项也只渲染为一行原子条目
- 服务端在素材同步阶段会把该文件夹内需要的文件推送到客户端本地素材库。
- 客户端渲染层播放到该项时，通过 `preload -> main` 的 `listMediaFolder` 桥接扫描本地目录，再生成临时子播放列表执行。

### 客户端到服务端

1. `REGISTER`
2. `HEARTBEAT`
3. `DOWNLOAD_STATUS`
4. `PLAYER_LOG`
5. `PLAYER_ERROR`
6. 截图/环境检查结果

## 4. 当前 folder 逻辑的正确边界

- 服务端 `normalizePlaylistDocument()`：
  - 保留 `folder` 条目，不负责递归展开。
  - 当前协议保留 `{ type: 'folder', path, durationMs }`，其中 `durationMs` 只对该文件夹内图片生效。
- 服务端 `pushPlaylistAssetsToDevice()`：
  - 仅在“素材推送”阶段按 `folder.path` 展开目录，把文件同步到客户端。
- 客户端 `applyPlaylist()`：
  - 保留 `folder` 项原样进入渲染层，并在主进程侧先完成整份列表解析后再统一发布。
- 客户端 `playCurrent()`：
  - 遇到 `folder` 时动态扫描本地素材库目录。
- 客户端 `advancePlaylist()`：
  - 优先在当前文件夹的临时子播放列表内部推进，结束后再回到顶层列表。

## 5. 当前最重要的运行文件

- 服务端源码入口：[server/src/main.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/server/src/main.js)
- 服务端业务核心：[server/src/backend/server.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/server/src/backend/server.js)
- 服务端 WS 网关：[server/src/backend/ws-gateway.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/server/src/backend/ws-gateway.js)
- 服务端 UDP 发现：[server/src/backend/udp-discovery.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/server/src/backend/udp-discovery.js)
- 服务端管理后台：[server/src/admin-ui/index.html](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/server/src/admin-ui/index.html)
- 客户端主进程：[client/src/main.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/client/src/main.js)
- 客户端素材管理：[client/src/media-manager.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/client/src/media-manager.js)
- 客户端 preload：[client/src/preload.js](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/client/src/preload.js)
- 客户端播放器页面：[client/src/renderer/index.html](/C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/client/src/renderer/index.html)
