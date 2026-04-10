# L1_REFACTORING_BLUEPRINT (蓝图总纲)

这是项目重构的最高意志。为了最小化 AI 上下文开销，请根据你的任务领域，点击下方链接进入对应的 L2 细节文档。

---

## 🏗️ 核心业务域 (L2 导向)

### 1. [UI/UX 审美与交互重构](./L2_UI_UX_RECONSTRUCTION.md)
- 解决管理端卡顿（删除大图预览）。
- 实现毛玻璃 2.0 与双舞台交叉淡入淡出。
- 右上角热区菜单与下载进度条。

### 2. [底层逻辑与性能升级](./L2_CORE_LOGIC_UPGRADE.md)
- 解决内网 48KB/s 限速（异步流 I/O）。
- 实现文件夹递归下发与原子化封装。
- 实现 WebSocket 实时差量推送（Device Patching）。

### 3. [架构治理与模块拆分](./L2_ARCH_DECOUPLING.md)
- 消除上帝文件（拆分 main.js 与 server.js）。
- 建立统一的 Store 状态管理。

---

## 🛠️ 执行工具 (L3 导向)
- **[原子级手术地图 (Surgical Map)](./L3_SURGICAL_MAP_ATOMIC.md)**：直接定位到文件和函数名的精准修改指令。
