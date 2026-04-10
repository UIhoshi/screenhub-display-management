# 工业级广告投屏系统进度报告 (PROGRESS.md)

## 2026-03-09 核心架构搭建

- **完成日期/时间**：2026-03-09 21:40
- **核心变更说明**：
  - 服务端与客户端基础框架实现。
  - 完成 UDP 发现、WebSocket 指令下发、MSI 静默安装基础逻辑。

## 2026-03-09 工业级稳定性与诊断增强 (Review 改进)

- **完成日期/时间**：2026-03-09 22:30
- **核心变更说明**：
  - **安全性 (Security)**：
    - 服务端素材上传与 MSI 上传改为基于 **内容 MD5 哈希** 重命名，彻底解决同名冲突与路径安全风险。
  - **稳定性 (Stability)**：
    - 客户端增加 **2GB 磁盘配额管理 (LRU)**，自动清理旧素材，防止磁盘撑爆。
    - 客户端 Hash 校验改为 **流式读取 (Stream)**，解决大文件计算时的内存溢出 (OOM) 风险。
    - 渲染进程增加 **播放错误捕获与自愈**，解码失败时立即跳过并上报，避免黑屏。
  - **诊断能力 (Operations)**：
    - 实现 **远程截屏 (Remote Screenshot)**，管理员可一键查看屏幕真实画面。
    - 管理后台增加 **实时错误日志显示**。
- **自测建议**：
  1. 上传一个同名但内容不同的文件，观察服务端 `storage/media` 下是否生成了两个不同的 MD5 文件。
  2. 点击管理后台的 "Capture Screen"，确认是否能实时看到客户端的截图。
  3. 故意损坏一个缓存视频（改后缀或内容），观察渲染进程是否能捕获错误并跳过播放。
- **待办事项**：
  - [ ] 实现客户端自更新逻辑 (Auto-updater)。
  - [ ] 优化大文件下载：增加断点续传支持。
  - [ ] 配对流程优化：增加物理验证码确认环节。

## 2026-03-09 中央资源同步删除与磁盘占用上报

- **完成日期/时间**：2026-03-09 23:42
- **核心变更说明**：
  - **服务端 (Centralized Purge)**：
    - 更新 [server/src/backend/server.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\server.js)。
    - 新增 `DELETE /api/assets/:fileName`，删除素材后会：
      - 物理删除服务端素材文件
      - 清理全局播放单与设备差异化播放单中的对应引用
      - 通过 WebSocket 广播 `PURGE_ASSET`
      - 广播新的播放单，避免客户端继续引用已删除素材
  - **客户端 (Disk Usage Monitoring)**：
    - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js)。
    - WebSocket 心跳现在携带 `diskUsage`：
      - `mediaBytes`
      - `installerBytes`
      - `totalBytes`
      - `quotaBytes`
    - 新增 `PURGE_ASSET` 指令处理，收到服务端删除广播后会物理删除本地缓存并重新同步播放单。
    - 修正 MSI 安装链路中异步 Hash 校验遗漏 `await` 的问题，避免安装包校验失真。
  - **管理后台**：
    - 更新 [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html)。
    - 素材库新增“删除素材”按钮。
    - 设备卡片新增磁盘占用显示，支持远程查看缓存健康度。
- **自测建议**：
  1. 上传一个临时素材后在管理页删除，确认：
     - 服务端素材库中对应文件消失
     - 播放单中对应素材引用被移除
     - 客户端收到更新后不会继续播放该素材
  2. 启动客户端并等待连接后，观察管理页设备卡片是否显示磁盘占用。
  3. 触发一次素材缓存后再次查看磁盘占用，确认数值会变化。
- **待办事项**：
  - [ ] 实现客户端自更新逻辑 (Auto-updater)。
  - [ ] 优化大文件下载：增加断点续传支持。
  - [ ] 配对流程优化：增加物理验证码确认环节。

## 2026-03-09 服务端 Hash 流式化收尾

- **完成日期/时间**：2026-03-09 23:46
- **核心变更说明**：
  - 更新 [server/src/backend/server.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\server.js)。
  - 服务端上传素材与 MSI 时，MD5 计算不再使用 `fs.readFileSync` 全量读入内存。
  - 服务端 `md5` / `sha256` 计算统一改为分块读取文件的实现，和最新 `CODEX_PROMPT.md` 中“性能优先、避免大文件 OOM”的要求对齐。
- **自测建议**：
  1. 上传一个较大的视频文件，观察服务端进程内存占用是否保持平稳。
  2. 上传完成后确认素材库仍能正常生成 `md5` / `sha256`，且客户端可继续下载校验。
- **待办事项**：
  - [ ] 实现客户端自更新逻辑 (Auto-updater)。
  - [ ] 优化大文件下载：增加断点续传支持。
  - [ ] 配对流程优化：增加物理验证码确认环节。

## 2026-03-10 第二阶段补充能力

- **完成日期/时间**：2026-03-10 00:07
- **核心变更说明**：
  - **配对流程优化**：
    - 更新 [server/src/backend/server.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\server.js)，客户端首次发现时服务端会生成 6 位 `pairingCode`。
    - `Approve` 不再是单纯点击通过，而是需要输入设备屏幕上显示的验证码。
    - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js) 与 [client/src/renderer/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\renderer\index.html)，在未审批时显示当前配对验证码。
  - **断点续传下载**：
    - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js)，下载素材、安装包、客户端更新包时支持基于 `Range` 的续传逻辑。
    - 如果目标文件已有部分内容，客户端会优先尝试从已下载偏移继续拉取。
  - **客户端自更新最小骨架**：
    - 服务端新增客户端发布包目录 [server/storage/releases/client](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\storage\releases\client)。
    - 新增 [PUT_CLIENT_RELEASE_HERE.txt](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\storage\releases\client\PUT_CLIENT_RELEASE_HERE.txt) 说明投放位置。
    - 新增 `/api/client-release/latest` 与 `/api/client-release/dispatch`。
    - 管理后台 [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html) 增加“客户端更新包”展示和 `Push Client Update` 操作。
    - 客户端新增 `APPLY_CLIENT_UPDATE` 指令处理，可下载更新包并静默执行。
- **自测建议**：
  1. 启动一个新客户端，确认屏幕与后台都能看到同一组 6 位配对验证码。
  2. 输入正确验证码后再审批，确认设备成功通过；输入错误验证码时应被拒绝。
  3. 将客户端发布包放入 `server/storage/releases/client` 后，确认后台能显示该更新包，并可对单台设备下发。
  4. 人为中断一次下载后重新触发，观察是否能继续而不是总从 0 开始。
- **待办事项**：
  - [ ] 将客户端自更新从“最小骨架”推进到完整版本治理，包括版本比较、更新后重启与失败回滚。
  - [ ] 为断点续传增加更完整的完整性校验与异常恢复策略。
  - [ ] 配对流程可继续增加时效控制、尝试次数限制和后台二维码/验证码展示优化。

## 2026-03-10 管理页去代码化

- **完成日期/时间**：2026-03-10 00:12
- **核心变更说明**：
  - 更新 [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html)。
  - 彻底移除普通用户可见的原始播放单 JSON 展示与“高级模式”入口。
  - 播放单配置现在只保留可视化表单交互：
    - 播放模式
    - 素材选择
    - 时长设置
    - 顺序调整
  - 目标是避免用户看到类似
    - `mode`
    - `items`
    - `md5`
    - `sha256`
    - `machineId`
    这类内部实现字段。
- **自测建议**：
  1. 打开管理页，确认默认界面不再出现原始 JSON 或代码块。
  2. 通过表单直接添加/删除/排序播放项并保存，确认无需理解内部结构也能完成配置。
- **待办事项**：
  - [ ] 后续可继续将设备卡片中的部分运维字段切换为“运维模式”显示，而不是对所有用户默认展示。

## 2026-04-10 管理端 token 真源统一与鉴权显式化

- **完成日期/时间**：2026-04-10
- **触发现象**：
  - 管理后台页面长期停留在“等待状态加载...”
  - 打包环境缺少 `.env` 或 token 变更后，`/api/status` 返回 `401 Unauthorized`
  - HTTP API 与 WebSocket 管理连接的 token 校验来源不一致，导致同一次启动内行为分裂
- **根因判断**：
  - [server/src/backend/server.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\server.js) 使用 `ADMIN_TOKEN` 常量校验 HTTP API
  - [server/src/backend/ws-gateway.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\ws-gateway.js) 直接读取 `process.env.AD_ADMIN_TOKEN` 校验管理端 WebSocket
  - [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html) 仍硬编码 `AS_LOCAL_ADMIN_20260310`
  - [server/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\main.js) 没有把缺失或占位值配置收敛为启动期硬失败
- **核心变更说明**：
  - 更新 [server/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\main.js)，服务端启动前强制校验 `AD_PAIRING_KEY` 与 `AD_ADMIN_TOKEN`，遇到空值或占位值直接报错退出。
  - 更新 [server/src/backend/server.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\server.js)，将 `AD_ADMIN_TOKEN` 收敛为唯一的 `resolvedAdminToken` 运行时真源，并将其传给路由与 WebSocket 网关。
  - 更新 [server/src/backend/ws-gateway.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\ws-gateway.js)，管理端 WebSocket 改为只使用 `server.resolvedAdminToken` 校验。
  - 更新 [server/src/backend/routes/system.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\routes\system.js)，新增无缓存的 `/admin-runtime`，向管理页注入运行时 token 与端口配置。
  - 更新 [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html)，移除前端硬编码 token，启动时先读取 `/admin-runtime`，并在 `401` 或 `ADMIN_AUTH_REJECTED` 时把侧栏状态切换为明确的鉴权失败提示。
- **验证记录**：
  - `node --check .\\server\\src\\main.js`
  - `node --check .\\server\\src\\backend\\server.js`
  - `node --check .\\server\\src\\backend\\ws-gateway.js`
  - 通过 Node `vm.Script` 解析 [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html) 内联脚本，确认脚本语法通过
  - 通过全文搜索确认源码中已移除管理页硬编码 `AS_LOCAL_ADMIN_20260310`，并确认 `/admin-runtime`、鉴权失败提示、统一 token 校验路径均已落点

## 2026-04-10 服务端密钥自举与稳定持久化

- **完成日期/时间**：2026-04-10
- **目标**：
  - 不再要求服务端必须预先存在 `.env` 才能进入可测试状态
  - 避免因缺失 `.env` 导致管理端出现“等待状态加载...”或 `Unauthorized`
  - 确保 `AD_PAIRING_KEY` / `AD_ADMIN_TOKEN` 在首次生成后稳定复用，不会因重启变化
- **核心变更说明**：
  - 更新 [server/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\main.js)：
    - 启动时优先读取 `.env`
    - 若 `.env` 未提供有效密钥，则回退到 `server-config.json`
    - 若两者都没有有效值，则首次自动生成 `pairingKey` 与 `adminToken`
    - 自动生成后的密钥会持久化到 `server-config.json`
    - 启动后统一把解析结果写回 `process.env`，供 HTTP、WebSocket 和管理端运行时配置共用
- **持久化路径模型**：
  - 开发环境：`server/storage/server-config.json`
  - 打包环境：服务端 `userData/storage/server-config.json`
- **验证记录**：
  - `node --check .\\server\\src\\main.js`
  - 通过源码检查确认 `resolveServerSecrets()` 已在加载 `AdServer` 前执行，避免后续模块读到占位值或空值

## 2026-04-10 客户端补充 UI 点击命中日志

- **完成日期/时间**：2026-04-10
- **目标**：
  - 让客户端日志明确回答“用户点到了哪个位置、哪个元素、哪层 UI”
  - 保持现有 `player:log -> main -> server` 链路，不另起一套日志通道
- **核心变更说明**：
  - 更新 [client/src/renderer/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\renderer\index.html)：
    - 新增 `describeElement()`、`buildElementPath()`、`resolveUiLayer()` 用于解析点击命中的 DOM 信息
    - 在捕获阶段监听 `pointerdown`，上报 `UI_POINTER_INTERACTION`
    - 日志载荷包含坐标、按钮、命中节点、节点路径、UI 层、当前激活播放层、菜单显隐状态
    - 在菜单打开/关闭时额外上报 `UI_MENU_TOGGLE`
- **验证记录**：
  - 通过 Node `vm.Script` 解析 [client/src/renderer/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\renderer\index.html) 内联脚本，确认脚本语法通过
  - 通过全文搜索确认 `UI_POINTER_INTERACTION`、`UI_MENU_TOGGLE`、`resolveUiLayer()` 等关键落点已进入源码

## 2026-04-10 客户端补充按钮状态快照与 handler 断点日志

- **完成日期/时间**：2026-04-10
- **目标**：
  - 专门定位“某些机器按钮无法点击”的问题
  - 让日志能区分命中失败、交互状态异常、handler 未进入、调用失败
- **核心变更说明**：
  - 更新 [client/src/renderer/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\renderer\index.html)：
    - 新增 `captureElementInteractionSnapshot()`，记录按钮点击时的 `disabled`、`pointer-events`、`display`、`visibility`、`opacity`、`z-index`、bounding rect
    - 新增 `logUiControlEvent()`，统一打出关键按钮的点击和结果日志
    - 语言切换按钮新增 `UI_LANG_BUTTON_CLICK` / `UI_LANG_BUTTON_APPLIED`
    - 退出按钮新增 `UI_QUIT_BUTTON_CLICK`
    - 素材目录按钮新增 `UI_CHOOSE_FOLDER_CLICK` / `UI_CHOOSE_FOLDER_RESULT` / `UI_CHOOSE_FOLDER_ERROR`
    - 菜单按钮与浮层收起动作新增 `UI_MENU_TRIGGER_CLICK` / `UI_OVERLAY_MOUSELEAVE`
- **验证记录**：
  - 通过 Node `vm.Script` 再次解析 [client/src/renderer/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\renderer\index.html) 内联脚本，确认新增日志代码语法通过
  - 通过全文搜索确认新增按钮日志事件名已进入源码

## 2026-04-10 客户端改为服务端签发设备认证

- **完成日期/时间**：2026-04-10
- **目标**：
  - 客户端自己生成并持久化 6 位配对码，用于首次人工匹配
  - 首次批准后由服务端签发设备认证凭据
  - 客户端将凭据持久化，仅在卸载时自然丢失
  - 服务端可在客户端在线或离线时撤销该凭据
- **现象与旧模型问题**：
  - 旧版 [server/src/backend/ws-gateway.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\ws-gateway.js) 仅依赖 `approvedDevices + pairingKey + fingerprint` 判断客户端身份
  - 旧版 [server/src/backend/routes/devices.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\routes\devices.js) 的解绑只删白名单和内存连接，没有独立的设备认证凭据可撤销
  - 旧版 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js) 没有服务端签发的持久化认证字段，客户端身份无法被细粒度吊销
- **核心变更说明**：
  - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js) 与 [main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\main.js)：
    - 客户端在 `client-config.json` 中生成并持久化 `clientPairingCode`
    - UDP 发现广播与首次 `REGISTER` 都会携带该 6 位码
    - 未批准或被撤销后，客户端继续保留该 6 位码并重新显示给用户
  - 更新 [server/src/backend/server.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\server.js)，新增 `storage/device-auth.json`，并加入 `issueDeviceAuth()`、`validateDeviceAuth()`、`revokeDeviceAuth()`，用于持久化每台设备的服务端签发认证。
  - 更新 [server/src/backend/ws-gateway.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\ws-gateway.js)：
    - 首次批准后的第一次连接仍允许使用 `pairingKey + fingerprint` 作为引导认证
    - 服务端在首次成功认证后签发 `deviceAuthToken`
    - 后续重连若服务端已有该设备认证记录，则必须携带有效 `deviceAuthToken`
  - 更新 [server/src/backend/routes/devices.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\routes\devices.js)：
    - 批准设备时校验的是客户端上报并展示的 6 位 `pairingCode`
    - 批准设备时先清掉旧认证记录，避免脏凭据残留
    - 解绑设备时同步删除 `device-auth.json` 中该设备认证
    - 若设备在线，服务端立即下发 `AUTH_REJECTED` 并断开连接；若离线，也会在磁盘侧完成吊销
  - 更新 [server/src/backend/udp-discovery.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\udp-discovery.js)，在设备状态中追加 `authProvisioned`，便于区分“已批准但尚未签发凭据”和“已签发凭据”
  - 同时保留“长期认证由服务端签发”的设计：
    - 客户端从 `client-config.json` 读取/保存 `deviceAuthToken`
    - `REGISTER` 时上送 `deviceAuthToken`
    - 收到 `AUTH_OK.deviceAuthToken` 后持久化到本地配置
    - 收到 `AUTH_REJECTED` 时只进入失效状态，不主动删除本地凭据
- **验证记录**：
  - `node --check .\\server\\src\\backend\\server.js`
  - `node --check .\\server\\src\\backend\\ws-gateway.js`
  - `node --check .\\server\\src\\backend\\routes\\devices.js`
  - `node --check .\\server\\src\\backend\\udp-discovery.js`
  - `node --check .\\client\\src\\main.js`
  - `node --check .\\main.js`
  - 通过全文搜索确认 `deviceAuthToken`、`device-auth.json`、`revokeDeviceAuth()`、`server-revoked` 等关键落点已经进入源码链路

## 2026-03-10 安全与运维缺口修复

- **完成日期/时间**：2026-03-10 00:20
- **核心变更说明**：
  - **强制安全配置**：
    - 更新 [server/src/backend/server.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\server.js)，服务端在 `AD_PAIRING_KEY` 或 `AD_ADMIN_TOKEN` 仍为默认占位值时拒绝启动。
    - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js)，客户端在 `AD_PAIRING_KEY` 仍为默认占位值时拒绝启动。
  - **后台最小鉴权**：
    - 服务端为所有 `/api/*` 接口增加 `x-admin-token` 校验。
    - 管理后台 [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html) 增加令牌输入与本地保存逻辑。
  - **截图落盘，避免内存累积**：
    - 服务端新增 `storage/screenshots` 持久化目录。
    - 客户端回传的截屏不再长期以内存 Base64 形式挂在设备状态，而是落盘后通过 URL 展示。
  - **全局缓存 LRU 与 GPU 状态上报**：
    - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js)，缓存清理改为跨 `media-cache` 与 `installer-cache` 的统一全局 LRU。
    - 心跳状态新增 `gpuStatus`。
    - 启动时追加 `ignore-gpu-blocklist` 并读取 GPU 特性状态用于远程上报。
- **自测建议**：
  1. 未配置 `AD_PAIRING_KEY` / `AD_ADMIN_TOKEN` 时启动服务端，确认进程直接报错退出。
  2. 未配置 `AD_PAIRING_KEY` 时启动客户端，确认进程直接报错退出。
  3. 打开管理后台时输入错误令牌，确认所有 API 请求返回未授权。
  4. 多次触发远程截屏，确认后台仍可查看截图，且服务端内存不会因 Base64 累积持续上涨。
  5. 下载媒体与安装包后观察设备状态，确认 `diskUsage` 与 `gpuStatus` 均可上报。
- **待办事项**：
  - [ ] 自更新仍未包含失败回滚策略。
  - [ ] 断点续传仍需更完整的完整性校验和异常恢复策略。

## 2026-03-10 第二阶段收口增强

- **完成日期/时间**：2026-03-10 00:35
- **核心变更说明**：
  - **客户端自更新补全版本治理**：
    - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js)，新增版本号比较逻辑。
    - 当服务端下发的客户端版本不高于当前版本时，客户端会直接回传 `skipped`，不再重复执行安装。
    - 更新包现在同时校验 `sha256` 和 `md5`。
    - 更新执行改为脱离当前 Electron 进程的 detached 启动，随后客户端主动退出，避免安装过程中被主进程阻塞。
    - 心跳状态新增 `clientVersion`，便于后台查看版本分布。
  - **后台健康度分级展示**：
    - 更新 [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html)，设备卡片新增 `Disk Health` 与 `GPU` 健康状态文本。
    - 磁盘占用按配额比例划分为 `healthy / warning / critical`。
    - GPU 状态按 Electron 上报特征划分为 `healthy / software / disabled / unknown`。
- **自测建议**：
  1. 将服务端发布包版本设置为低于或等于当前客户端版本，触发更新，确认设备状态回传 `skipped`。
  2. 将服务端发布包版本设置为更高版本，触发更新，确认客户端下载、校验后会启动安装并自动退出当前进程。
  3. 打开管理后台，确认设备卡片中能看到 `Disk Health`、`GPU`、`Client` 版本信息。
- **待办事项**：
  - [ ] 客户端自更新仍未包含真正的二进制失败回滚。

## 2026-03-10 更新验收与下载恢复补强

- **完成日期/时间**：2026-03-10 00:48
- **核心变更说明**：
  - **更新验收确认**：
    - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js)，客户端在启动更新包前会写入 `pending-update.json`。
    - 更新后下次启动时会自动读取该标记，并根据当前版本与目标版本比较结果回传 `update-confirmed` 或 `update-failed`。
    - 为避免离线期间状态丢失，安装状态回传增加了本地队列，待 WS 鉴权成功后自动补发。
  - **断点续传恢复增强**：
    - 下载函数现在会校验 `Content-Range` 起始位置和最终文件大小。
    - 当续传片段不合法、文件长度不匹配时，会自动删除坏分片并退回全量重下，而不是继续沿用损坏缓存。
    - 服务端播放单项目补充 `size` 字段，客户端缓存媒体时会基于该字段做长度校验。
- **自测建议**：
  1. 下发高版本客户端更新包，确认客户端退出后重新启动，再连回后台时状态会从 `updated` 变成 `update-confirmed`。
  2. 人为制造一个不完整缓存文件，再触发素材或安装包下载，确认客户端会丢弃坏分片并重新下载。
  3. 中断网络后恢复，确认状态队列会在重新连上 WS 后自动补发。
- **待办事项**：
  - [ ] 如需跨多版本保留更长历史，后续可将 `release-history` 从单机保留扩展为更明确的版本保留策略。

## 2026-03-10 客户端更新回滚闭环

- **完成日期/时间**：2026-03-10 01:02
- **核心变更说明**：
  - **已安装版本归档**：
    - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js)，客户端在更新确认成功后，会把当前更新包归档到 `release-history`，并写入 `installed-release.json`。
    - 这样后续再次升级时，客户端本地会保留最近一个已确认版本的静默安装包信息，作为回滚源。
  - **失败后自动回滚**：
    - 当客户端启动时发现上一次升级未达目标版本，且当前版本也不等于升级前版本时，会自动启动上一个已确认版本的安装包做静默回滚。
    - 回滚过程新增 `rollback-started`、`rollback-confirmed`、`rollback-failed` 状态，后台可直接看到。
  - **状态清理闭环**：
    - 更新标记文件在成功确认、失败判定或回滚完成后会自动清理，避免重复进入恢复逻辑。
- **自测建议**：
  1. 先完成一次成功升级，确认本地生成 `release-history` 和 `installed-release.json`。
  2. 再构造一个异常升级场景，确认客户端下次启动时会尝试自动回滚，并回传 `rollback-started`。
  3. 回滚后的再次启动应回传 `rollback-confirmed`，且不会持续重复进入回滚流程。
- **待办事项**：
  - [ ] 如需更强的回滚能力，后续可支持保留多个历史版本而不是仅依赖最近一次已确认版本。

## 2026-03-10 本地环境启动修复

- **完成日期/时间**：2026-03-10 01:15
- **核心变更说明**：
  - **本地 `.env` 加载支持**：
    - 新增 [server/src/load-env.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\load-env.js) 和 [client/src/load-env.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\load-env.js)。
    - 服务端和客户端现在都会在启动最早阶段自动读取各自目录下的 `.env`，不再依赖用户手工设置系统环境变量。
  - **本地开发默认配置补齐**：
    - 新增 [server/.env](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\.env) 与 [client/.env](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\.env)，并保证双方使用同一组 `AD_PAIRING_KEY`。
    - 同时补充 [server/.env.example](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\.env.example) 与 [client/.env.example](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\.env.example) 作为后续部署模板。
  - **启动失败体验修复**：
    - 更新 [server/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\main.js)，服务端启动失败时会明确弹窗并退出，不再出现 `UnhandledPromiseRejectionWarning`。
- **自测建议**：
  1. 直接在 `server` 目录运行 `npm start`，确认服务端可正常启动。
  2. 删除或改坏 `server/.env` 中的关键值，再次启动，确认会显示明确错误而不是未处理 Promise。

## 2026-03-10 设备中心化后台重构

- **完成日期/时间**：2026-03-10 01:32
- **核心变更说明**：
  - **删除独立播放单编辑区**：
    - 重构 [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html)，管理后台不再把“内容编排”作为常驻独立大面板。
    - 后台现在以“设备列表”为核心，只有点击设备上的“配置”或批量勾选后，才会弹出配置面板选择素材和播放模式。
  - **批量勾选与批量下发**：
    - 设备卡片新增勾选框，可全选已审批设备、清空勾选、批量配置所选设备。
    - 服务端新增 [server/src/backend/server.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\server.js) 的 `/api/playlist/dispatch` 批量接口，用于一次性向多台设备保存并下发差异化播放配置。
  - **Grid 隔离布局**：
    - 后台改为固定左侧资源栏 + 右侧设备工作区的 Grid 布局，素材库、安装包区和设备列表彻底隔离，不再因配置区或长内容导致重叠。
- **自测建议**：
  1. 上传多个素材后确认左侧资源栏宽度稳定，设备列表不会被挤压到下方。
  2. 勾选多台已审批设备后点“批量配置所选设备”，确认会弹出配置面板而不是在主界面展开。
  3. 点击某台设备的“配置”，确认会加载该设备当前内容并可直接保存下发。

## 2026-03-10 Dashboard 侧边栏架构重塑

- **完成日期/时间**：2026-03-10 01:48
- **核心变更说明**：
  - 重写 [server/src/admin-ui/index.html](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\admin-ui\index.html) 为 Dashboard 结构。
  - 左侧改为固定 240px 垂直导航，只保留：
    - 设备列表
    - 素材库
    - 安装包
    - 系统状态
  - 右侧改为单工作区，点击导航后切换对应功能面板，不再平铺多个功能框。
  - 素材库在右侧工作区改为大卡片网格展示，支持图片/视频预览。
  - 分发配置改为右侧抽屉，只有从设备列表触发“配置”或批量配置时才打开。
- **自测建议**：
  1. 点击左侧不同导航，确认右侧只显示对应一个功能面板。
  2. 进入素材库，确认素材以大卡片网格展示，并支持预览。
  3. 从设备列表打开“配置”或“配置所选设备”，确认右侧抽屉滑出，主工作区布局不乱。

## 2026-03-10 离线交付自举补充

- **完成日期/时间**：2026-03-10 03:20
- **核心变更说明**：
  - 为服务端和客户端新增离线启动入口：
    - [server/Launch-Offline.cmd](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\Launch-Offline.cmd)
    - [client/Launch-Offline.cmd](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\Launch-Offline.cmd)
    - [server/scripts/offline-bootstrap.ps1](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\scripts\offline-bootstrap.ps1)
    - [client/scripts/offline-bootstrap.ps1](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\scripts\offline-bootstrap.ps1)
  - 脚本会按顺序处理：
    - 安装 `offline/prereqs` 中的本地依赖包
    - 检查是否已有已安装程序
    - 若无安装版，则优先运行 `offline/portable` 中的本地便携版
    - 若便携版也没有，再尝试 `offline/packages` 中的安装包
  - 已将服务端和客户端当前构建出的 `win-unpacked` 便携版拷入各自的 `offline/portable/win-unpacked`
  - 已下载并放入通用运行时：
    - [client/offline/prereqs/VC_redist.x64.exe](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\offline\prereqs\VC_redist.x64.exe)
    - [server/offline/prereqs/VC_redist.x64.exe](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\offline\prereqs\VC_redist.x64.exe)
  - 补充离线部署说明文档：
    - [OFFLINE_DEPLOYMENT.md](C:\Users\XU RONG\Documents\workspace\Advertising screen\OFFLINE_DEPLOYMENT.md)
- **当前限制**：
  - 本机构建正式 NSIS 安装包时，`electron-builder` 卡在 `winCodeSign` 缓存解压的符号链接权限问题，因此当前离线交付先以便携版为主。
  - 若后续需要正式 `Setup.exe`，需在允许符号链接解压的环境中继续打包。

## 2026-03-10 无人值守安装闭环

- **完成日期/时间**：2026-03-10 03:38
- **核心变更说明**：
  - **客户端主动自检**：
    - 更新 [client/src/main.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\client\src\main.js)，客户端在收到 `AUTH_OK` 后会立即主动检测 `VLC` 是否安装。
    - 检测结果通过新的 `ENV_REPORT` WebSocket 消息上报给服务端。
    - MSI 安装完成或判断已安装后，也会再次主动回报对应组件状态。
  - **服务端自动补装**：
    - 更新 [server/src/backend/server.js](C:\Users\XU RONG\Documents\workspace\Advertising screen\server\src\backend\server.js)，服务端收到 `ENV_REPORT` 后会自动匹配关键组件对应的 MSI。
    - 当前已内置 `VLC` 规则：若客户端报告未安装，且安装包库中存在名称或产品名包含 `vlc` 的 MSI，服务端会自动下发 `INSTALL_PACKAGE`。
  - **下载链接纯内网化**：
    - 服务端生成素材、安装包、客户端更新包和播放单中的下载链接时，改为基于设备发现阶段记录的服务端 IP 生成。
    - 避免客户端收到 `localhost`、错误网卡地址或与 `SERVER_ACK` 不一致的下载地址。
- **自测建议**：
  1. 在客户端未安装 VLC 的情况下完成配对，确认客户端 `AUTH_OK` 后无需人工点击就会上报环境状态。
  2. 确保服务端安装包库中存在包含 `vlc` 的 MSI，确认服务端收到 `ENV_REPORT` 后会自动向该客户端下发安装。
  3. 在客户端日志或设备状态中确认素材、MSI、更新包下载地址均使用局域网内服务端 IP。
