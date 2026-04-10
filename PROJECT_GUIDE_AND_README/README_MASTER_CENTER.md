# Advertising Screen 项目指挥中心 (The Control Center)

欢迎来到本项目。为了实现高效的 AI 协作并最小化上下文开销，请根据你的需求，点击下方链接进入对应的“时空维度”。

---

## GitHub 账号强制说明

**最高优先级：在这台电脑上执行任何 GitHub / 仓库相关操作时，一律以本机 `git` / `gh` CLI 的登录身份为准，不以会话连接器显示的账号为准。**

**当前本机 GitHub CLI 已确认主账号为：`UIhoshi`。**

执行规则：
- 只要任务涉及 GitHub、远程仓库、建仓、拉取、推送、分支、PR、release、权限判断，默认全部按 `UIhoshi` 账号处理。
- 如果连接器账号与本机 CLI 账号不一致，必须忽略连接器侧账号显示，优先采用本机 `gh auth status` 的结果。
- 在这台电脑上，不得把 `ImAubrey` 视为默认 GitHub 身份，除非用户在当次任务中明确重新指定。
- 如需再次核验 GitHub 身份，优先执行：`gh auth status`。

## 🚀 未来与重构 (Blueprint)
如果你是来执行**代码重构、功能修复或 UI 升级**的，请阅读：
- **[L1_REFACTORING_BLUEPRINT](./blueprint/L1_REFACTORING_BLUEPRINT.md)**
- *包含：下载提速、文件夹下发修复、监控实时化方案、UI 列表化重构。*

## 📍 现状与定义 (Status)
如果你是来**研究当前架构、排查现有 Bug 或部署生产环境**的，请阅读：
- **[L1_SYSTEM_DEFINITION](./status/L1_SYSTEM_DEFINITION.md)**
- **[V1.0.0 Stable Baseline](./status/03_V1_0_0_STABLE_BASELINE.md)**
- *包含：端架构定义、各模块通信协议、当前函数职责索引。*

## 📜 历史与演进 (History)
如果你想了解**某个功能为何被引入或追溯历史变更**，请阅读：
- **[L1_EVOLUTION_MAP](./history/L1_EVOLUTION_MAP.md)**
- *包含：从 3 月 9 日至今的所有里程碑日志。*

---

### 🛡️ AI 助手变更同步协议 (Synchronization Protocol)

为了确保项目“时空对齐”，所有执行重构的助手（Codex/Claude）必须严格遵守以下同步纪律：

1.  **先读后写**：在动手修改代码前，必须先读取 `blueprint/L3_SURGICAL_MAP_ATOMIC.md` 确认手术指令。
2.  **即时同步 (Sync on Success)**：每当你成功完成一个 L3 级函数的重构，必须立即执行以下文档更新：
    -   **更新 `status/L3_FUNCTION_REGISTRY.md`**：修改该函数的职责描述，反映最新的代码现实。
    -   **更新 `history/L2_MILESTONE_LOGS.md`**：在当日里程碑下增加一条变更记录（如：“已实现文件夹原子化下发”）。
3.  **闭环确认**：在向用户汇报“改好了”之前，请务必确认相关文档已更新到位。

### 📦 打包交付硬性要求

后续所有构建产物，统一按以下规则交付：

1. 最终可交付的安装包只放在项目根目录的 `windows/`。
2. `windows/` 目录内只允许保留两个文件：
   - `AdvertisingScreenServer-Setup-1.0.0.exe`
   - `AdvertisingScreenClient-Setup-1.0.0.exe`
3. `server/dist`、`client/dist` 中生成的新安装包，在验证完成后必须覆盖复制到 `windows/`。
4. 不允许把旧版本 exe、blockmap、便携版目录或其他临时打包产物留在 `windows/`。
5. 用户验收时，默认只查看 `windows/`，不得再让用户区分 `dist/`、`offline/` 或其他输出目录。
6. 启动行为属于打包验收的一部分：
   - 双击服务端图标，必须直接进入网页管理后台。
   - 双击客户端图标，必须直接进入播放器测试页面，并显示匹配码/等待连接状态。
7. 打包完成后，必须先验证上述启动行为，再把最新安装包覆盖到 `windows/`。
8. 任何 build 过程中遇到的故障、安装版回归、路径错位、缓存错位、共享目录错位，必须同步写入部署文档与 lessons 文档，不能只留在会话里。

### 📋 打包后故障记录要求

每次打包后的排障都必须记录以下内容：

1. build 命令与特殊参数
   - 例如 `--config.win.signAndEditExecutable=false`
2. 产物时间戳
   - `source` 修改时间
   - `dist` 安装包时间
   - `windows/` 最终交付包时间
   - 安装目录 `resources/app.asar` 时间
3. 预期故障
   - 例如路径写入 `app.asar`
   - 前端缓存不刷新
   - 安装包未覆盖最新源码
   - 共享推送目录与安装版读取目录不一致
4. 修复动作
   - 改了哪个文件
   - 重新打包后如何验证
5. 结论
   - 是否已进入 `windows/`
   - 是否需要远端重装

---
**总策划 (Architect)**: Gemini CLI
**总工 (Chief Engineer)**: Claude / Codex
