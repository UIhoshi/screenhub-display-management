# 03_FUNCTION_DETAILS (L3 - 细节层)

## 1. 服务端核心 (Server Backend)

### 1.1 素材库逻辑
- `getAssetCatalog(dir)`: 递归扫描目录。
- `getAssetDirectory(dir)`: 获取当前级文件列表。
- `describeAssetFile(fileName)`: 封装文件元数据（MD5/URL/类型）。

### 1.2 播放列表下发逻辑
- `saveAndDispatchPlaylist(machineId, payload)`: 主入口。
- `normalizePlaylistDocument(payload)`: 归一化播放列表，当前正确逻辑是保留 `type: 'folder'`，不在这里展开目录。
- `normalizePlaylistItem(item)`: 将文件、文件夹、文本项归一化为统一结构。
- `pushPlaylistAssetsToDevice(machineId, playlist)`: 在真正下发素材时，按播放列表项补齐客户端本地库所需文件；遇到 `folder` 时只在这一阶段展开目录同步。
- `copyAssetToClient(machineId, fileName)`: 核心拷贝函数，当前已改为异步流式复制。

### 1.3 通信与状态
- `ws-gateway.js`: 处理 WS 注册、心跳、状态上报。
- `udp-discovery.js`: 处理设备发现与 IP 自动识别。

### 1.4 历史偏差与纠正
- 历史偏差：
  - 旧实现曾使用 `expandPlaylistItems(items)` 在服务端预展开文件夹，破坏“动态文件夹播放”。
- 当前纠正：
  - 预展开逻辑已从主链路移除。
  - 服务端只保留 `folder` 条目，并把“目录展开”限定在素材同步阶段。

## 2. 服务端 UI (Admin UI)

### 2.1 渲染引擎
- `renderDevices(devices)`: 设备列表主渲染入口；当前已接入 `DEVICE_PATCH` 后的局部卡片更新。
- `renderAssets(listing)`: 素材库主渲染入口，支持大图/缩略图/列表三种视图，以及“加入下发列表”快捷入口。
- `renderDrawerSourceMenu()`: 从 `/item` 一级目录生成抽屉素材下拉。
- `renderPlaylistItems(items)`: 当前采用单行原子编辑模型；文件夹与文件都只占一行，不展开内部内容。条目使用 flex 行结构，右侧控制组固定贴边。

### 2.2 交互逻辑
- `refresh()`: 已拆分为轻量状态刷新与按需素材刷新，避免高频扫素材库。
- `addAssetToPlaylist(path)`: 把单个一级文件加入播放列表。
- `addFolderToPlaylist(path)`: 把一级文件夹作为单个 `folder` 条目加入播放列表。
- `addSelectedDrawerEntry()`: 根据下拉当前值决定调用文件或文件夹入口。
- `syncDrawerSelectionToTargetItem()`: 若存在当前编辑行，则只替换该行；否则保持待选状态，不误改第一行。
- `setActivePlaylistIndex(index)`: 标记当前编辑中的播放项，解决“修改哪一项不可感知”的问题。
- `renderPlaylistItems(items)`: 当前配置抽屉已改为紧凑行模式，文件夹项显示为单行原子条目，不再附带内部文件选择器。
- `applyConfigToTargets()`: 负责下发状态锁、进行中提示、完成提示以及下发提交。触发入口当前位于抽屉底部 Footer。

## 3. 客户端主进程 (Client Main)

### 3.1 播放器控制
- `applyPlaylist(payload)`: 将主进程配置投递到渲染层；遇到 `folder` 项时保留 `{ type: 'folder', path, durationMs }`，并在真正投递前完成整份列表解析，避免半成品发布。
- `persistPlaybackSnapshot()`: 任务持久化。
- `ipcMain.handle('player:list-media-folder')`: 扫描本地素材库对应目录，递归返回图片/视频/文本文件，供渲染层动态生成子播放列表。

### 3.2 素材管理 (media-manager.js)
- `syncStagedAssetToLocalLibrary(item)`: 核心同步逻辑。
- `syncStagedFolderToLocalLibrary(relativeFolderPath)`: 在文件夹播放前将中转目录对应文件夹增量同步到本地素材库。
- `downloadToPath(url, targetPath)`: 异步下载逻辑。

## 4. 客户端渲染层 (Renderer)

### 4.1 双舞台状态机
- `activateStage(nextStage)`: 执行淡入淡出。
- `playCurrent()`: 媒体分发核心，当前已支持 `text` 渲染分支，并在遇到 `folder` 时触发目录扫描。
- `buildFolderPlaybackState(item)`: 扫描本地素材库目录并生成临时子播放列表。
- `primeFolderPlaybackState(item)`: 预先扫描并缓存即将播放的文件夹项。
- `prewarmUpcomingFolder()`: 在当前项播放期间预热下一项若为 folder 的目录状态。
- `getCurrentPlayableItem()`: 在顶层列表与文件夹子列表之间解析当前实际可播放项。
- `advancePlaylist()`: 优先推进当前文件夹子播放列表，子列表结束后回到顶层列表；下一轮再次进入该 folder 时重新扫描目录。
- `clearPlayback()`: 清空主列表与文件夹临时状态。
- `applyPlaybackPayload(payload)`: `immediate` 模式下会先清空旧舞台再切到新播放单，避免“已下发但不切播”。

## 5. 当前 folder 动态播放的完整链路

1. 服务端 UI 把目录加入播放列表时，只写入一个 `folder` 条目。
2. 服务端 `normalizePlaylistDocument()` 保留该条目，并把协议保留为 `{ type: 'folder', path, durationMs }`。
3. 服务端 `pushPlaylistAssetsToDevice()` 在下发阶段扫描该目录并把文件同步到客户端本地素材库。
4. 客户端主进程在 `applyPlaylist()` 和 `player:list-media-folder` 前，都会先执行 `staging -> media-library` 的目录增量同步。
5. 客户端主进程 `applyPlaylist()` 保留 `folder` 项，并通过 IPC 提供目录扫描能力。
6. 客户端渲染层 `playCurrent()` 每次进入该目录项时都重新扫描本地目录。
7. 渲染层依据扫描结果创建临时子播放列表，因此目录内容变化可以在后续轮播中自动生效。

## 6. 当前抽屉真实结构

1. `drawer-head`
   - 标题与关闭按钮左右对齐。
2. `drawer-topbar`
   - 左侧 `loadTemplateButton`
   - 右侧 `mode-field`
3. `drawer-content`
   - `drawer-body`
   - `drawer-section-head`
   - `drawer-source-row`
   - `playlist-items`
4. `drawer-footer`
   - `playlistHint`
   - `applyConfigButton`
