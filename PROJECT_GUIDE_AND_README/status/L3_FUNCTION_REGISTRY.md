# L3_FUNCTION_REGISTRY (现状字典)

本文件详述系统当前所有物理函数的职责。

约束格式：
- 只要出现函数名、事件名或命令名，默认都应给出物理文件位置。
- 推荐格式：`函数名()` — `相对文件路径:近似行号`
- 行号允许随重构漂移，但必须足够让后续 AI 直接跳到目标文件，而不是重新全量扫描。
- 关键函数条目还应补充“相关函数 / 调用链 / 相关文档锚点”，帮助后续 AI 快速顺藤摸瓜。

---

## 🖥️ 服务端业务核心 (`server/src/backend/server.js`)

### [资产处理]
- `getAssetCatalog(dir)`: 递归扫描 `storage/media` 目录，返回树状结构。
- `describeAssetFile(fileName)`: 封装单个文件的 MD5、SHA256、URL 及类型信息。
- `copyAssetToClient(machineId, fileName)`: 已改为流式拷贝，使用读写流把素材推送到客户端共享中转目录。
- `registerAssetRoutes -> DELETE /api/assets`: 删除接口现为幂等；若文件已不存在，返回成功而非 `Asset not found`。

### [下发策略]
- `normalizePlaylistDocument(payload)`: 统一播放列表格式。当前支持 `loop / sequence / single / random`。遇到目录时保留对象 `{ type: 'folder', path, durationMs, folderPlayMode }`；其中 `durationMs` 作为文件夹内图片的统一切换规则透传给客户端，`folderPlayMode` 控制该文件夹内部按顺序或随机完整播放一轮。
- `pushPlaylistAssetsToDevice(machineId, playlist)`: 在实际素材推送阶段按 `folder.path` 扫描目录并同步文件；返回给设备的播放单仍保留顶层 `folder` 项，但会额外挂载其内部 `entries`，让安装版客户端无需依赖本地目录扫描即可完成文件夹播放。

### [状态管理]
- `updateDevice(machineId, patch)`: 内存中更新设备心跳与下载状态。
- `broadcastToAdmin(payload)`: 向已连接的后台管理页面广播实时差量消息，用于设备状态局部刷新。

---

## 📡 通信与路由

### [WS 网关 (`server/src/backend/ws-gateway.js`)]
- `registerWebSocketGateway(server)` — `server/src/backend/ws-gateway.js:8`: 初始化 WebSocket 服务并挂载消息监听器；当前同时支持设备连接和后台管理页连接。
  - 相关函数：`server.updateDevice()` — `server/src/backend/server.js`；`server.broadcastToAdmin()` — `server/src/backend/server.js`
  - 相关消息：`HEARTBEAT`、`DOWNLOAD_STATUS`、`LOCAL_ASSET_SNAPSHOT`
- `REGISTER_ADMIN`: 后台页面通过管理令牌建立实时监控连接。
- `HEARTBEAT / DOWNLOAD_STATUS`: 在更新设备状态后，额外广播 `DEVICE_PATCH` 给后台页面。
- `LOCAL_ASSET_SNAPSHOT`: 接收客户端当前本地素材库快照，写入 `device.localAssetSnapshot`，并实时推送给后台页面。

### [UDP 发现 (`server/src/backend/udp-discovery.js`)]
- `registerUdpDiscovery(server)`: 处理 8888 端口广播，动态识别同网段 IP。
- `registerClientHello({ machineId, deviceName, platform, clientIp })` — `server/src/backend/server.js`: 把 UDP 广播发现与 HTTP 静态握手统一收敛到同一套建档逻辑，返回当前设备的 `approved / pairingCode / serverIp`。
  - 相关函数：`normalizeRemoteIp()` — `server/src/backend/server.js`；`POST /api/client/hello` — `server/src/backend/routes/system.js`；`registerUdpDiscovery(server)` — `server/src/backend/udp-discovery.js`

### [HTTP 路由 (`server/src/backend/routes/*.js`)]
- `registerAssetRoutes`: 资产上传/删除/目录读取接口。
- `registerDeviceRoutes`: 设备审批/解绑/命令下发接口。
- `POST /api/client/hello` — `server/src/backend/routes/system.js`: 给静态地址模式客户端提供“非 UDP 首次接入”入口；客户端可直接拿到配对码与批准状态，再决定是否建立 WS。

---

## 🧩 管理后台 (`server/src/admin-ui/index.html`)

### [素材库与配置抽屉]
- `renderAssets(listing)`: 渲染素材库。在所有视图模式下（大图、缩略图、列表）均提供显著的绿色 “+” 按钮，支持文件夹和文件“一键加入”播放单。
- `renderAssetSelection()`: 维护上传前文件预览区；空列表时保留“已选择 0 个素材 / 尚未选择素材”占位，选中后立即显示文件名与大小。
- `renderDrawerSourceMenu()`: 将素材库 `/item` 下的一级文件和一级文件夹同步为抽屉下拉菜单；选择文件时加入单文件条目，选择文件夹时加入单个原子化 `folder` 条目。
- `addAssetToPlaylist(path)`: 将单个文件作为播放项加入当前编辑中的播放列表。若配置抽屉关闭，则自动打开抽屉。
- `addFolderToPlaylist(path)`: 将指定目录作为单个 `folder` 条目加入当前编辑中的播放列表。若配置抽屉关闭，则自动打开抽屉。
- `addSelectedDrawerEntry()`: 读取一级菜单下拉的当前选项；若为文件则加入单文件条目，若为文件夹则加入单个 `folder` 条目。
- `syncDrawerSelectionToTargetItem()`: 一级菜单下拉不再盲目覆盖第一项，而是只替换当前高亮编辑中的播放行；若未选中任何行，则不做覆盖。
- `updateDrawerFolderInfo()`: 抽屉顶部固定显示“一级菜单：/item”，不再复用素材库目录导航逻辑。
- `refreshDrawerAssetCatalog()`: 抽屉素材源固定读取 `/item` 一级菜单，不再跟随素材库浏览路径切换。
- `setActivePlaylistIndex(index)`: 标记当前正在编辑的播放项，供一级菜单下拉替换目标条目时使用。
- `renderPlaylistItems(items)`: 按 48px 单行结构渲染下发清单。文件夹项也只占一行，并提供统一图片时长输入以及“文件夹内顺序/随机”选择；视频项不显示时长输入。当前编辑行会显示高亮和编号，便于区分“正在修改哪一项”。
- `getEditorState()`: 采集当前下发清单；若条目为 `folder`，会连同统一图片时长一起写入 `durationMs`，并写入 `folderPlayMode`。
- `applyConfigToTargets()`: 下发过程中会锁定“保存并下发”按钮并显示进行中/完成状态，避免重复点击造成并发下发；成功后不再立即关闭抽屉，确保用户能看到状态反馈。
- `deleteAsset(fileName)`: 前端先从当前列表移除目标素材，再请求后端删除，完成后主动刷新当前目录；失败则回滚当前列表。
- `deleteAssetFolder(folderPath)`: 目录删除与单文件删除采用同样的“乐观移除 + 成功后刷新 + 失败回滚”策略。
- `drawer-topbar / mode-field / drawer-source-row / drawer-footer`：当前抽屉真实结构。顶部为模板与播放模式，中部为素材选择和播放项列表，底部为提示与满宽下发按钮。
- `renderDevices(devices)` — `server/src/admin-ui/index.html:641`: 当前设备卡片已重构为“头部身份 / 关键元信息 / 系统区 / 指标区 / 传输区 / 操作区”的信息架构，使用玻璃面板和分段容器提升可读性，但未改变任何原有命令按钮和 `data-role` 更新点。
  - 相关函数：`renderLocalAssetSnapshot(device)` — `server/src/admin-ui/index.html:541`；`buildDeviceMetrics(device)` — `server/src/admin-ui/index.html`
- `renderLocalAssetSnapshot(device)` — `server/src/admin-ui/index.html:541`: 把 `device.localAssetSnapshot` 渲染为“扫描摘要 + 文件列表 + 单文件删除按钮”，用于直接观察客户端本地素材残留。
  - 相关函数：`scanLocalAssets(machineId)` — `server/src/admin-ui/index.html:442`；`deleteLocalAssetFromDevice(machineId, assetPath)` — `server/src/admin-ui/index.html:443`；`updateDeviceCard(machineId)` — `server/src/admin-ui/index.html:551`
- `scanLocalAssets(machineId)` — `server/src/admin-ui/index.html:442`: 通过已有命令通道下发 `SCAN_LOCAL_ASSETS`，要求客户端重新上报本地素材清单。
  - 相关函数：`sendCommand(machineId, command, data)` — `server/src/admin-ui/index.html:440`；`renderLocalAssetSnapshot(device)` — `server/src/admin-ui/index.html:541`
- `deleteLocalAssetFromDevice(machineId, assetPath)` — `server/src/admin-ui/index.html:443`: 通过已有命令通道下发 `DELETE_LOCAL_ASSET`，要求客户端删除指定本地素材并回传最新快照。
  - 相关函数：`sendCommand(machineId, command, data)` — `server/src/admin-ui/index.html:440`；`renderLocalAssetSnapshot(device)` — `server/src/admin-ui/index.html:541`
- `initWebSocket()`: 连接服务端 WS，建立后台实时监控通道。
- `applyDevicePatch(machineId, patch)`: 接收 `DEVICE_PATCH` 后合并内存状态并触发局部 DOM 更新。
- `updateDeviceCard(machineId)` — `server/src/admin-ui/index.html:551`: 通过 `data-machine-id` 只更新单个设备卡片中的数值、文本和进度条宽度，不重绘整卡。
  - 相关函数：`applyDevicePatch(machineId, patch)` — `server/src/admin-ui/index.html:552`；`renderLocalAssetSnapshot(device)` — `server/src/admin-ui/index.html:541`

---

## 📺 客户端核心 (`client/src/main.js` / `client/src/media-manager.js`)

### [主进程生命周期]
- `createWindow()` — `client/src/main.js`：初始化全屏播放窗口。
- `startWsWatchdog()` — `client/src/main.js`：监测 WS 连接活性，超时自动重连。
- `parseManualServerEndpoint(rawInput)` — `client/src/main.js`: 解析客户端保存的服务器地址；当前支持 IP、主机名以及带协议的 URL，默认仍使用 `3000/3001` 端口。
  - 相关函数：`normalizeManualServerConfig()` — `client/src/main.js`；`applyManualServerConnection()` — `client/src/main.js`
- `resolvePreferredLocalIp()` — `client/src/main.js`: 从当前网卡中筛选优先级最高的非回环 IPv4，作为客户端当前固定 / 主用局域网地址。
  - 相关函数：`reportHeartbeatStatus()` — `client/src/main.js`；`sendStatus()` — `client/src/main.js`
- `applyManualServerConnection(forceReconnect)` — `client/src/main.js`: 当客户端配置了手动服务器地址或环境变量固定服务器地址后，直接建立 HTTP / WS 连接，并停止 UDP 广播发现。
  - 相关函数：`createDiscoverySocket()` — `client/src/main.js`；`restartAutomaticDiscovery()` — `client/src/main.js`；`connectWebSocket()` — `client/src/main.js`
- `applyPlaylist(payload)` — `client/src/main.js:1219`：应用服务端播放列表；遇到带 `entries` 的 `folder` 项时，会先把文件夹内部条目逐个解析为本地可播放资源，再把整个文件夹项一次性投递给渲染层。当前仍保持“整份播放单准备完后再一次性发布”，避免混合 `video + folder` 时出现先播单项、后补全列表的竞态。
  - 相关函数：`cacheMediaItem(item)` — `client/src/media-manager.js`；`reportLocalMediaAssetsSnapshot()` — `client/src/main.js:871`
- `writeBootstrapCrash(error)` — `client/src/main.js:24`: 在主进程极早期模块加载失败时，直接写入 `client-bootstrap.log`，避免只弹 Electron 错误框而没有落地日志。
  - 相关函数：`createMediaManager` 的模块加载入口 — `client/src/main.js:44-47`；`configureLogging()` — `client/src/main.js:117`
  - 相关文档：`PROJECT_GUIDE_AND_README/status/L2_CLIENT_ARCH.md` 的“启动与运行模型”
- `scanLocalMediaAssets()` — `client/src/main.js:831`: 递归扫描当前 `media-library`，构造当前客户端本地素材快照。
  - 相关函数：`reportLocalMediaAssetsSnapshot()` — `client/src/main.js:871`；`deleteLocalMediaAsset(relativePath)` — `client/src/main.js:896`
- `reportLocalMediaAssetsSnapshot()` — `client/src/main.js:871`: 将扫描结果通过 WS 以 `LOCAL_ASSET_SNAPSHOT` 上报给服务端；在认证成功、播放单应用后、以及服务端手动触发时都会调用。
  - 相关函数：`scanLocalMediaAssets()` — `client/src/main.js:831`；`handleCommand(payload)` — `client/src/main.js:1463`；`applyPlaylist(payload)` — `client/src/main.js:1219`
- `deleteLocalMediaAsset(relativePath)` — `client/src/main.js:896`: 删除客户端本地素材库中的指定文件，并向上清理空目录。
  - 相关函数：`handleCommand(payload)` — `client/src/main.js:1463`；`reportLocalMediaAssetsSnapshot()` — `client/src/main.js:871`
- `player:get-connection-settings` / `player:set-manual-server-address` — `client/src/main.js` + `client/src/preload.js`: 暴露给渲染层的连接配置接口，用于读取当前手动 / 固定服务器地址状态，或在客户端界面中直接保存服务器地址并切换连接方式。
  - 相关函数：`renderConnectionControls()` — `client/src/renderer/index.html`；`saveManualServerAddress()` — `client/src/renderer/index.html`

### [素材同步 (`client/src/media-manager.js`)]
- `createMediaManager(deps)` — `client/src/media-manager.js`: 初始化资产管理器。
- `downloadToPath(url, targetPath)` — `client/src/media-manager.js`: 处理异步文件拉取与 HASH 校验。
- `syncStagedFolderToLocalLibrary(relativeFolderPath)` — `client/src/media-manager.js`: 在客户端播放文件夹前，把共享中转目录下对应文件夹增量同步到本地素材库，保证 folder 扫描和瞬时切换读取的是本地最新文件。
- `cacheMediaItem(item)` — `client/src/media-manager.js`: 当 `pushedRelativePath` 指向的本地推送文件缺失时，当前会记录告警并回退到 HTTP 下载缓存，不再直接抛出“本地资源缺失”终止播放。

### [渲染层播放器 (`client/src/renderer/index.html`)]
- `renderConnectionControls()`：渲染客户端状态浮层中的“服务器地址”输入区；当前支持保存手动服务器地址，或切回 UDP 自动发现。
- `saveManualServerAddress()` / `enableAutoDiscovery()`：从客户端界面直接写入服务器地址配置并触发重新连接；适用于客户现场 UDP 广播被阻断但服务器地址固定的场景。
- `playCurrent()`: 遇到 `folder` 时优先使用该项自带的 `entries` 构建内部子播放列表；若无 `entries`，再回退到客户端本地目录扫描。
- `buildFolderPlaybackState(item)`: 生成当前 folder 的临时子列表状态，并把 `folder.durationMs` 作为该目录内图片的统一播放时长；若 `folderPlayMode=random`，则会对内部条目打乱一次后完整播放一轮。
- `primeFolderPlaybackState(item)`: 预扫描并缓存 folder 目录内容，减少双舞台切换前的等待，并继承 `folder.durationMs`；同一路径但不同 `folderPlayMode` 会拆分为不同缓存键。
- `prewarmUpcomingFolder()`: 在当前媒体播放期间预热下一个 folder 项，避免切换时的微卡顿。
- `advancePlaylist()`: 优先推进 folder 内部子列表，结束后返回顶层列表。
- `getNextTopLevelIndex()`: 顶层播放列表推进策略。`random` 现在按“顶层完整一轮去重随机”推进，folder 作为一个整体参与随机；进入 folder 后内部素材再按该 folder 自己的 `folderPlayMode` 走完整一轮。
- `applyPlaybackPayload(payload)`: 当 `applyStrategy === 'immediate'` 时，不再保留当前仍存在于新列表中的旧项，而是强制从新播放单第 1 项立即切播。
- `shouldAutoHideCursor() / scheduleCursorHide() / syncCursorVisibility()`: 播放时 1.5 秒无鼠标动作则隐藏光标；鼠标移动或菜单打开时立即恢复。
- `setCursorVisibility(visible)`: 显式控制 `html/body/#app` 的光标样式，避免只靠 class 切换导致“已隐藏但鼠标移动不恢复”的状态错误。
- `PLAYLIST_APPLIED` 事件日志：现已补充 `folder.path`，便于从双端日志直接核对目录型条目是否完整到达渲染层。

---

## 🔗 演进方向
- 所有的 **[性能瓶颈]** 与 **[待优化]** 项目，请查阅 **[blueprint/L3_SURGICAL_MAP_ATOMIC.md](../blueprint/L3_SURGICAL_MAP_ATOMIC.md)** 获取重构指令。
