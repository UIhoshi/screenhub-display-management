# L2_MILESTONE_LOGS (里程碑历史细节)

本文件详细记录了项目演进中的关键决策。

---

## 🏗️ 2026-03-09：核心架构搭建
- **核心逻辑**: 实现了 UDP 发现与 WS 控制的基础链路。
- **决策**: 引入 MD5 重命名机制，解决内网环境下素材命名的冲突问题。

## 📍 2026-03-10：设备中心化重构
- **核心逻辑**: 将 Admin UI 从“播放单为中心”改为“设备列表为中心”。
- **决策**: 引入“配置抽屉”模式，减少主界面的视觉负载。

## 🧪 2026-03-13：工业级稳定性专项
- **核心逻辑**: 实现了双舞台 (Double-Stage) 播放，消除了切换时的黑屏感。
- **决策**: 引入 PING/PONG 哨兵机制，解决 TCP 僵尸连接导致的状态假死。

## 🧭 2026-03-14：文件夹原子化下发修正
- **变更**: 已重构 `renderAssets(listing)`，素材库中的文件夹卡片新增“一键加入播放列表”按钮。
- **变更**: 已新增 `addFolderToPlaylist(path)`，统一把目录作为单个 `{ type: 'folder', path }` 条目推入配置抽屉。
- **决策**: `addCurrentFolderItems()` 现已复用同一入口，避免素材库按钮与抽屉按钮出现两套 folder 逻辑。
- **同步**: 已更新函数注册表，确认 `normalizePlaylistDocument(payload)` 当前保留 folder 原样下发，`copyAssetToClient(machineId, fileName)` 已为流式复制，客户端 `playCurrent()` 已承担 folder 自扫描播放。
- **变更**: 已新增 `addAssetToPlaylist(path)`，单文件加入播放列表也改成从素材库直接完成。
- **变更**: 已重构 `renderPlaylistItems(items)`，分发配置列表不再包含行内素材下拉框，只显示最终已选条目。
- **变更**: 已按 `L3_SURGICAL_MAP_ATOMIC` 将 `renderPlaylistItems(items)` 改为镜像素材库列表模式的 `.asset-list-row` 结构，废除自创抽屉行布局。
- **变更**: 已完成 `renderPlaylistItems` 的“工业感”重构，采用严格的 4-column Grid 布局（36px 缩略图 | 自适应标题 | 播放时长输入 | 紧凑控制项），彻底废除冗余的“类型”、“路径”文字标签。
- **变更**: 已完成 `renderAssets` 的“一键加入”逻辑补齐，在所有视图模式下（大图、缩略图、列表）均提供显著的绿色 “+” 按钮，点击后自动同步打开配置抽屉。
- **变更**: 已简化素材库的 Meta 信息显示，移除重复的“路径：”、“类型：”等中文前缀，改为单行灰色 Meta 栏，大幅提升视觉信息密度。
- **变更**: 已优化 `addAssetToPlaylist` 与 `addFolderToPlaylist` 的交互逻辑，点击 “+” 时若配置抽屉处于关闭状态，将自动执行 `openConfigDrawerWithTargets` 开启抽屉并显示新增项。
- **变更**: 已为客户端 folder 播放增加 `primeFolderPlaybackState(item)` / `prewarmUpcomingFolder()` 预扫描缓存，减轻双舞台切换前的目录扫描卡顿。
- **变更**: 已新增 `broadcastToAdmin(payload)`，为后台实时差量推送打通服务端广播入口。
- **变更**: 已扩展 `registerWebSocketGateway(server)`，支持后台 `REGISTER_ADMIN` 连接，并在 `HEARTBEAT / DOWNLOAD_STATUS` 后广播 `DEVICE_PATCH`。
- **变更**: 已新增后台 `initWebSocket()` / `applyDevicePatch()` / `updateDeviceCard()`，设备监控改为 WS 差量推送 + 局部 DOM 更新。
- **变更**: 设备卡片进度条已增加 `transition: width 0.3s ease-out`，下载进度将以补间动画更新。
- **变更**: 已将分发配置的素材选择收回为同步 `/item` 一级菜单的下拉列表，不再跟随素材库浏览目录漂移；一级文件夹现在作为单个原子化条目加入下发清单。
- **变更**: 已补齐 `folder.durationMs` 透传链路，配置抽屉可统一设置文件夹内图片时长，服务端原样保留并由客户端在文件夹自治播放时继承执行。
- **变更**: 已修复共享目录源码客户端缺失 `media-manager.js` 导致的主进程启动崩溃问题，并新增 `writeBootstrapCrash(error)`，确保模块缺失类错误会落到 `client-bootstrap.log`。
- **变更**: 已修复 folder 下发后图片未进入客户端本地素材库的问题。客户端在应用 folder 播放单和扫描目录前，会先把 `media-staging` 对应目录增量同步到 `media-library`，恢复“缓存到位即瞬切”的行为。
- **变更**: 已修复“新播放单已下发但客户端仍保留旧项继续播放”的问题。渲染层在 `applyStrategy: immediate` 下不再保留当前项，改为强制从新列表首项立即切换。
- **变更**: 已修复客户端主进程对播放单的“半成品增量发布”问题。`applyPlaylist(payload)` 不再在解析过程中多次发布临时列表，而是等待整份播放单就绪后一次性下发给渲染层，避免 `video + folder` 混合时先播单视频、后补全 folder 的竞态。
- **变更**: 已补充 `PLAYLIST_APPLIED` 日志中的 `folder.path` 字段，后续双端排障可以直接确认目录条目是否完整进入渲染层。
- **变更**: 已为分发抽屉补齐下发过程状态锁。点击“保存并下发”后按钮会进入进行中状态并禁止重复操作，完成后再恢复。
- **变更**: 已修复“添加一项总是复制默认第一项”的交互偏差。抽屉现增加当前编辑行高亮与编号，一级菜单下拉只替换当前高亮项；若没有高亮项，“加入下发列表”才会真正追加新行。
- **变更**: 已修复“保存并下发状态看不到”的问题。成功下发后抽屉不再立即关闭，提示文案会保留展示“正在下发/下发完成”状态，再自动回到普通提示。
- **变更**: 已撤销一轮错误的抽屉 UI 改动，恢复为“一级菜单下拉 + 当前编辑行高亮 + 加入下发列表”的交互模型；移除了把素材库目录导航、同步当前目录逻辑直接塞进分发抽屉的做法。
- **变更**: 已新增 `random` 播放模式。随机逻辑只作用于顶层播放列表项，folder 作为一个原子整体参与随机；进入 folder 后内部素材仍按顺序播放，且 `durationMs` 只影响其中图片。
- **变更**: 已修复 folder 图片只停留在 `media-staging` 而未补齐到 `media-library` 的问题；客户端在应用 folder 播放单和扫描目录前，都会执行目录级增量同步。
- **变更**: 已修复“播放列表已应用但未切到新视频”的问题；渲染层在 `immediate` 下发时会先清空旧舞台，再切到新列表首项。
- **变更**: 已补齐后台和客户端的同步链路说明：源码运行环境下仍需重启实际运行的 `npm start / electron .` 进程，否则页面会继续使用旧内存状态。
- **变更**: 抽屉结构已进一步调整为：顶部 `drawer-topbar` 只保留“载入模板 + 播放模式”，底部 `drawer-footer` 承担满宽“保存并下发”按钮。
- **变更**: 抽屉素材选择区已改为 `75/25` 的 input-group，下拉与“添加一项”按钮严格等高。
- **变更**: 已按“现代工业级指挥中心”方向重置服务端 Admin UI 视觉层：重写色彩系统、引入毛玻璃 panel/drawer、统一按钮与输入框材质，并重构设备卡片为分段式信息架构；本轮仅调整样式与静态容器结构，不改动核心功能逻辑。

---

## 📜 原始日志
- 参见 **[00_HISTORY_PROGRESS_LOG.md](./00_HISTORY_PROGRESS_LOG.md)** 查看原始开发日记。

---

## 🧷 2026-04-09：V1.0.0 稳定基线固化
- **变更**: 已修复服务端 Admin UI 因 API 条件缓存导致的“等待状态加载...”卡死问题，当前 `/api` 统一关闭缓存，前端请求链路已增加空响应兜底。
- **变更**: 已修复客户端“服务端提示下发成功但远端不播放”的根因，打包态客户端运行目录已统一切到 `client/media-library`、`client/media-staging`、`client/control`。
- **变更**: 已确认客户端最终素材保存目录以客户端本机选择路径为准，并通过状态上报同步回服务端设备卡片。
- **变更**: 已修复播放时鼠标隐藏逻辑，当前使用全页面 `cursor-hidden` 强制样式，静止 `1.5s` 后隐藏，移动后恢复。
- **变更**: 已将本地修复后的 `client-unpacked` 散包同步到远端 `\\\\172.16.1.10\\screen\\client-unpacked`。
- **变更**: 已创建稳定回退快照 `windows/backups/v1.0.0-stable`，其中同时包含源码快照 `source-snapshot` 与散包快照 `runtime-snapshot`。
- **变更**: 已重封装 `AdvertisingScreenClient-Setup-1.0.0.exe` 与 `AdvertisingScreenServer-Setup-1.0.0.exe`，安装器已改为带界面的多语言 NSIS 版本。
- **变更**: 两个安装器均已加入三语安装说明页，明确系统完全离线运行，仅获取软件故障排查相关的本地信息与日志，不向任何个人、公司、平台或组织上传、同步或共享数据。
- **决策**: 后续凡是确认稳定的版本，都必须同时备份“源码可覆盖快照”和“散包可覆盖快照”，不能只保留安装包或只保留 `app.asar`。

## 🧷 2026-04-10：客户端固定地址直连补强
- **变更**: 已为客户端新增“服务器地址”输入区，客户现场若禁用 UDP 广播，可在客户端界面直接保存服务器 IP 或主机名并立即重连。
- **变更**: 客户端当前会优先读取 `client-config.json` 中保存的手动服务器地址；若部署时设置了 `AD_SERVER_FIXED_IP` 或 `AD_SERVER_HOST`，则会把它作为固定服务器地址自动直连。
- **变更**: 手动 / 固定地址模式下，客户端会停止持续 UDP 广播，改为直接走 HTTP / WS 连接，减少内网策略阻断时的无效重试。
- **变更**: 客户端新增本机 `localIp` 自动识别逻辑，会从当前网卡中挑选主用非回环 IPv4，显示在状态栏并随心跳上报，便于核对现场固定 IP。
- **决策**: 多 DNS 场景不做客户端内部分支判断；服务器地址只要支持主机名，解析统一交给操作系统当前网卡 / DNS 配置处理。
- **变更**: 已为服务端新增 `POST /api/client/hello` 静态握手入口，并把 UDP 发现与 HTTP 静态握手统一收敛到 `registerClientHello(...)`；首次接入也可在无 UDP 广播的内网里拿到配对码。
- **变更**: 本次客户端 / 服务端散包构建继续沿用 `--config.win.signAndEditExecutable=false`，绕过 `winCodeSign` 缓存解压时的符号链接权限问题，成功生成最新 `win-unpacked`。
- **变更**: 已使用以下命令生成最新正式安装包并覆盖到项目根目录 `windows/`：
  - `client`: `npx electron-builder --win --x64 --config build/electron-builder.json --config.win.signAndEditExecutable=false`
  - `server`: `npx electron-builder --win --x64 --config build/electron-builder.json --config.win.signAndEditExecutable=false`
- **产物时间戳**:
  - `windows/AdvertisingScreenClient-Setup-1.0.0.exe` — `2026-04-10 17:27:35`
  - `windows/AdvertisingScreenServer-Setup-1.0.0.exe` — `2026-04-10 17:27:35`
