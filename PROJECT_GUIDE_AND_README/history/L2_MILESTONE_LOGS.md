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

## 🧷 2026-04-11：V1.0.1 稳定版与仓库公开交付
- **变更**: 已确认一条高频根因链：同一台 Windows 机器若同时保留多个客户端形态（旧散包、安装版、旧目录副本、残留启动项），会导致 UI 无法点击、保存并下发后不播放、错误实例被拉起。
- **变更**: 已为客户端主进程加入实例冲突清理逻辑，启动时会清理冲突客户端进程、旧自启动、旧计划任务与旧运行目录，但默认不清空用户配置与业务数据。
- **变更**: 已为服务端加入单实例保护，第二实例会被阻止，避免多服务端并存导致端口、托盘和管理状态混乱。
- **变更**: 已固化新的稳定源码备份目录：
  - `project-backups/backups/v1.0.1-stable`
- **变更**: 该备份目录内已同步当前稳定源码快照：
  - `source-snapshot/client-src`
  - `source-snapshot/client-build`
  - `source-snapshot/server-src`
  - `source-snapshot/server-build`
- **变更**: 已构建并验证当前带清理逻辑的客户端 / 服务端散包，用于同机冲突回归与远端启动链路排查。
- **变更**: 已创建并发布 GitHub 仓库：
  - `https://github.com/UIhoshi/screenhub-display-management`
- **变更**: 已按 `v1.0.1` 创建 release，并上传两个安装包：
  - `AdvertisingScreenServer-Setup-1.0.0.exe`
  - `AdvertisingScreenClient-Setup-1.0.0.exe`
- **变更**: 已重写仓库 README 为首页化结构，并补齐：
  - 使用说明 / Quick Start
  - 中英日三语独立 README
  - 顶部居中标题、居中副标题、居中 badges、居中语言切换入口
- **决策**: 后续多语 README 默认采用独立文件互链结构，不再把三语全文堆叠在同一个 README 页面中。
- **决策**: 后续 README 只要被作为仓库首页处理，就应优先采用 Hero 式顶部结构：居中标题、居中副标题、居中 badges、居中多语入口。

## 🧷 2026-04-17：逻辑入口与鉴权收口
- **变更**: 已把仓库级逻辑入口文档从失效的 `AgentLogic_V6/` 路径统一回收至当前真实目录 `AgentLogic/`，同步更新 `README.md`、`AGENTS.md`、`README_MASTER_CENTER.md` 与 `PROJECT_FACT_MAP.md`。
- **变更**: 已修复设备解绑后旧 WebSocket 会话仍可继续上报状态的问题。服务端新增 `revokeClientSession(machineId, reason)`，`POST /api/pair/unbind` 会主动切断在线连接；WS 网关也会在设备失去批准后拒绝后续 `HEARTBEAT / DOWNLOAD_STATUS`。
- **变更**: 已消除 Admin UI 与服务端的 token 默认值分叉。后台首页改为由服务端在返回 `index.html` 时注入当前 `AD_ADMIN_TOKEN`，WS 与 HTTP 统一使用同一来源，不再保留前端写死的独立常量。
- **变更**: 已收紧源码中的敏感默认值策略。客户端与服务端启动时都要求显式配置 `AD_PAIRING_KEY`，服务端要求显式配置 `AD_ADMIN_TOKEN`；远程启动凭据若未配置，将拒绝执行远程启动而不是落回硬编码账号密码。
- **变更**: 已将入口/控制文件顶部提醒统一为固定英文模板，并补齐此前缺失的 `ws-gateway.js`、`udp-discovery.js`、`routes/assets.js`、`routes/devices.js`、`routes/playlist.js` 等头部规则。
- **变更**: 已新增仓库级校验脚本 `scripts/check-logic-entry.js`，用于机械检查 `README.md`、`AGENTS.md` 以及关键入口/控制文件是否仍保留标准逻辑入口链路。
- **变更**: 已把逻辑入口校验接入 `client/package.json` 与 `server/package.json` 的 `check:logic` 脚本，后续可在任一子工程目录直接执行 `npm run check:logic`。
- **验证**: 已通过 `node --check` 验证以下入口与服务端文件语法：
  - `client/src/main.js`
  - `server/src/backend/server.js`
  - `server/src/backend/ws-gateway.js`
  - `server/src/backend/routes/devices.js`
  - `server/src/backend/routes/system.js`
- **验证**: 本轮还应执行 `node scripts/check-logic-entry.js`，以及 `client/`、`server/` 目录下的 `npm run check:logic`，确认仓库文档入口与头部规则模板未漂移。
- **说明**: 当前目录未挂接 `.git` 仓库，无法使用 `git status` 继续做版本差异校验；本轮验证以静态语法检查和路径残留扫描为主。
- **审查记录**: 已完成一轮“只审查、不改代码”的安全复核，确认当前仍存在 3 个待处理风险，后续必须单独立项收口：
  - `server/src/backend/server.js` 会在未认证访问首页时把真实 `AD_ADMIN_TOKEN` 注入 `index.html`，导致“能打开后台页”几乎等价于“已拿到后台口令”。
  - `server/src/backend/routes/system.js` 当前仍允许未认证访问 `/api/client/playlist`，且服务端返回的播放单会带绝对媒体 URL；已知 `machineId` 的同网段主机可直接探测目标设备播放内容。
  - `server/src/backend/routes/system.js` 当前仍允许未认证访问 `/api/client/hello`，外部调用方可枚举设备批准状态，并在已知 `machineId` 时取回配对码。
- **边界说明**: 上述 3 项仅完成风险确认与文档留痕，本轮未进入接口改造、鉴权重构、兼容性回归或安装包重打。

## 🧷 2026-11-16：Git 仓库对齐与代码模块化瘦身
- **仓库整合**: 已将根目录接入 Git（`main...origin/main` 对应 `UIhoshi/screenhub-display-management`），同步 `.gitignore` 与 `README.zh-CN.md` / `README.ja.md`，并屏蔽 `AgentLogic/`、`tmp_repo_publish/`、`project-backups/`、`release-assets/`、`tasks/` 等本地私有目录。
- **服务端清理**:
  - 新增 `server/src/backend/utils/auth.js`（基于 SHA-256 + `crypto.timingSafeEqual`），统一 `routes/system.js` 与 `ws-gateway.js` 的管理员令牌校验。
  - 新增 `server/src/backend/utils/network.js`，抽离局域网 IP 解析并移除 `server/package.json` 中已停止维护的 `ip` 依赖。
  - 将 `POST /api/installers/upload` 从 `server/src/backend/server.js` 归位到 `server/src/backend/routes/devices.js`，并删除未使用的死方法 `summarizePlaylist()`。
- **客户端模块化**:
  - 保留全部原有功能不变，从 `client/src/main.js` 抽离 `client/src/services/auto-launch.js`（自启与远程启动计划任务）与 `client/src/services/updater.js`（安装包校验、更新与回滚，合并重复校验逻辑），`client/src/main.js` 精简约 430 行。
- **验证**: 18 个 JS 文件通过 `node --check`，`node scripts/check-logic-entry.js` 通过。
- **IP 直连修复**:
  - 修复 `client/src/main.js` 手动/固定 IP 模式下服务端未就绪或等待配对审批时不再重试轮询 `/api/client/hello` 的断点（新增 `scheduleManualServerRetry()` 5s 轮询直到连接并获批）。
  - 将显式配置的服务器探测超时从 `1000ms` 放宽到至少 `3000ms`，并修复 `player:set-manual-server-address` 空地址输入抛异常的问题。
- **逻辑副本清理**: 移除旧版 `AgentLogic/`（V6）副本、`scripts/check-logic-entry.js` 及源码顶部绑定注释头，同步 GitHub 最新 `AGENTS.md` 与多语 `README`。
- **使用链路优化（不改 UI）**:
  - `server.js` `saveAndDispatchPlaylist()` 增加 SMB 推送失败降级兜底，确保失败时仍可通过 WS 下发 `SET_PLAYLIST` 让客户端走 HTTP 拉取。
  - 修复 `server.js` `copyAssetToClient()` 同字节大小文件覆盖时先写新 meta 导致跳过校验的顺序 Bug。
  - `server.js` `describeAssetFile()` 增加基于 `size + mtimeMs` 的 `assetHashCache`，避免每次目录扫描同步重算全部大文件 MD5/SHA-256。
  - `routes/playlist.js` `/api/playlist/dispatch` 改为 `Promise.all` 并发独立下发，单台失败不再阻断其余屏幕。
  - `client/src/media-manager.js` `downloadToPath()` 增加 HTTP `416` 自动清空残片重下；`client/src/main.js` `applyPlaylist()` 改为并发度 3 的有序缓存拉取。
