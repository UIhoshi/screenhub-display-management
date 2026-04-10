# Advertising Screen 项目深度 Review 与优化建议报告

## 1. 针对反馈问题的深度分析

### 1.1 无法显示纯文字素材 (Issue: Text Display)
- **原因**：客户端渲染层 (`renderer/index.html`) 的 `playCurrent` 函数中，媒体分发逻辑是二元的（不是视频就是图片）。DOM 结构中缺少承载文字的容器（如 `div` 或 `iframe`）。
- **优化方案**：
  - **数据层**：在服务端 `server.js` 的 `getMediaType` 函数中增加对 `.txt`, `.html` 的支持，归类为 `text` 类型。
  - **渲染层**：在 `index.html` 中增加一个全屏的 `#text-container`。
  - **逻辑层**：在 `playCurrent` 中增加 `item.type === 'text'` 分支。如果是 `.txt`，通过 `fetch()` 获取内容并填充到 `div`；如果是 `.html`，则使用隐藏的 `iframe` 渲染。

### 1.2 无法下发整个文件夹 (Issue: Folder Dispatch)
- **原因**：下发协议 (`SET_PLAYLIST`) 是基于文件列表的。服务端 `copyAssetToClient` 函数使用 `fs.copyFileSync`，该函数仅支持文件拷贝，遇到文件夹路径会直接报错。
- **优化方案**：
  - **服务端预处理**：在 API 接收到下发请求时，检测 `items` 中的路径。若是目录，则在服务端执行递归扫描（利用已有的 `getAssetCatalog`），将目录下的所有文件“扁平化”展开成文件列表，再发送给客户端。
  - **客户端透明化**：客户端不需要感知文件夹，它只需要接收到一串文件流并按序播放即可。

### 1.3 播放模式术语优化 (Issue: Terminology)
- **建议**：不要改动代码中的 `loop`, `sequence`, `single` 逻辑值，而是在多语言包中进行翻译。
- **翻译对照表**：
  - `loop` (逻辑值) -> **全员循环 / Loop All / 全リピート**
  - `sequence` (逻辑值) -> **列表顺序播放 / Sequence / 順次再生**
  - `single` (逻辑值) -> **单项循环 / Single Repeat / 1曲リピート**

---

## 2. 工程架构审计建议 (Architectural Audit)

### 2.1 修复内网下载限速 (Performance)
- **发现**：服务端在分发素材到客户端中转目录时，使用了同步阻塞的 `fs.copyFileSync`。
- **影响**：在大文件传输时，这会阻塞 Node.js 主线程，导致心跳包积压、WebSocket 超时甚至 UI 卡死，间接导致“限速”错觉。
- **建议**：改用流式拷贝（Stream），并结合 `fs.promises.copyFile` 以释放主线程。

### 2.2 强化 WebSocket 状态机 (Robustness)
- **发现**：报错截图显示 `WebSocket was closed before connection...`。
- **现状**：代码中已有 `ws.terminate()` 保护。
- **建议**：引入 **心跳超时 (Watchdog)** 逻辑。如果客户端 30 秒未收到服务端的 PING，不论当前状态显示是否为 `connected`，强制销毁旧实例并重建。

### 2.3 播放稳定性 (Playback)
- **建议**：在 `index.html` 的 `playCurrent` 中，针对视频增加一个“安全超时”。如果 `video.play()` 后 5 秒内没有触发 `playing` 事件（可能是解码器挂了），自动强制跳转到下一项，避免黑屏死等。

---

## 3. 多语言架构建议 (I18n)
- **现状**：目前已在 `index.html` 实现初步字典。
- **建议**：将 `locales` 字典提取到独立的 `locales.js`，通过 `preload.js` 加载，使代码结构更清晰。

## 5. 工程化与代码框架治理建议 (Codebase Refactoring)

由于之前项目被多次迭代且存在单一文件过长的问题（例如 `client/src/main.js` 达到了 1800 行），在本次重构中，请务必执行以下**代码框架化**策略。这不仅是为了修复 Bug，更是为了还技术债，提升代码的可维护性。

### 5.1 模块拆分：消除“上帝文件” (God Object)
`client/src/main.js` 和 `server/src/backend/server.js` 承担了过多职责，必须进行领域驱动拆分。

*   **Client 端拆分方案**：
    *   **核心控制**：保留在 `main.js`，仅负责应用生命周期和基础 IPC。
    *   **网络模块**：提取 `network.js`（或 `network/` 文件夹），专门封装 UDP 发现和 WebSocket 状态机。
    *   **素材模块**：提取 `media-manager.js`，专职处理大文件的下载、缓存检查、磁盘配额管理。
*   **Server 端拆分方案**：
    *   **路由模块**：将冗长的 `initExpress` 拆分为独立的文件（如 `routes/assets.js`, `routes/devices.js`）。
    *   **通信网关**：提取 `ws-gateway.js` 专门处理 Socket.io/WS 的连接与心跳广播。

### 5.2 状态管理：引入集中式 Store
*   **痛点**：目前散落在各处的 `currentPlaybackState`、`pendingPayload` 很容易产生竞态条件。
*   **建议**：在主进程中引入一个极简的状态机（如通过 Node EventEmitter 实现的单例 Store），所有状态更新（如：从“下载中”切换到“准备播放”）必须通过派发 Action 来完成，杜绝直接修改全局变量。

### 5.3 错误处理：告别“静默吞噬”
*   **痛点**：代码中存在大量 `try { ... } catch (error) { log.warn('...', error) }`，导致很多严重 Bug（如文件占用导致的崩溃）被隐藏。
*   **建议**：建立全局的 `Error Class` 体系（如 `NetworkError`, `MediaError`, `FileSystemError`）。在关键节点捕获特定类型的错误，如果属于“可恢复错误”才吞噬，否则必须抛出并进入“安全退回模式”（显示默认保底图片）。

### 5.4 给 Codex 的执行纪律
在执行后续代码重构时，请遵循以下原则：
1.  **先拆解后修改**：在修改复杂的 WebSocket 逻辑前，先将其抽离到独立函数或文件中。
2.  **避免过度设计**：不要引入诸如“多级虚拟文件系统”这样超出当前业务需求的复杂逻辑（这也是之前性能下降的原因）。
3.  **拥抱现代 API**：在文件操作上，全面淘汰同步的 `fs.xxxSync`（除初始化阶段外），全面拥抱 `fs.promises` 以避免阻塞主线程。

---
**报告完成日期**：2026-03-13
**状态**：Review 完毕，待执行建议。

## 4. UI/UX 体验重构建议 (UI/UX Refactoring)

为了提升产品的专业感和交互体验，建议 Codex 对客户端渲染层进行以下审美升级：

### 4.1 视觉风格：工业级美感 (Industrial Aesthetic)
- **色阶调整**：将硬黑色 `#050505` 改为深石墨色，并利用 `linear-gradient` 增加深度。
- **高级毛玻璃**：
  ```css
  .overlay {
    background: rgba(20, 20, 20, 0.6);
    backdrop-filter: blur(25px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
  ```
- **字体规范**：强制使用无衬线系统字体栈，并针对中日英优化字重（Light/Regular/Medium）。

### 4.2 动效：消除视觉中断 (Visual Continuity)
- **媒体交叉淡入淡出**：
  - 在 `index.html` 中维护两个媒体层（当前与下一项）。
  - 使用 `opacity` 动画实现平滑过渡（0.8s），解决视频加载瞬间的黑屏问题。
- **状态栏入场**：增加 `cubic-bezier` 曲线的滑入滑出动效，使其显得灵动而非生硬。

### 4.3 交互：现场运维友好 (Ops-Friendly)
- **全局加载进度条**：
  - 在屏幕顶部增加一个 2px 高的半透明进度条（Accent Color）。
  - 实时反映服务端下发素材的整体进度（transferred / total）。
- **紧急热区 (Hot Corner)**：
  - 定义屏幕右上角 100x100 像素为热区，鼠标悬停 2 秒自动呼出管理菜单。
  - 增加“刷新素材库”和“重启 App”的快捷按钮，减少对远程指令的依赖。

### 4.4 管理后台 (Admin UI) 优化
- **素材卡片化**：将素材列表改为带预览图的卡片模式，方便一眼识别视频内容。
- **设备拓扑图**：在首页增加简单的设备状态图标，使用脉冲动画表示“正在下载”，使用静态绿色表示“正常播放”。

### 4.9 监控窗口 UI 交互与极致实时化 (Human-Centric Monitor)

**目标：将监控窗口从“数据列表”提升为“实时仪表盘”，确保管理员一眼识别故障与进度。**

#### A. 视觉语言重构 (Human-Readable UI)
- **状态感知**：
  - **在线/离线**：使用带 `animation: pulse 2s infinite` 效果的呼吸灯图标。
  - **异常高亮**：若设备 `lastError` 不为空，卡片背景微调为淡红色，并将错误信息置顶显示。
- **资源可视化 (Micro-Sparklines)**：
  - 将 CPU/内存/存储百分比转化为超细的水平进度条（高度 4px），颜色根据数值阶梯变化（<60% 绿, 60-85% 橙, >85% 红）。
- **下载进度“焦点模式”**：
  - 当 `state === 'downloading'` 时，在卡片右上角显示明显的 **[实时下载中]** 标签。
  - **ETA 计算**：前端根据当前 `bytesPerSecond` 和 `totalBytes` 实时计算并显示“预计还需 2 分钟”。

#### B. 极致平滑的实时同步 (Smooth Real-time Sync)
- **逻辑层：基于 WebSocket 的 Push 架构**
  - 服务端 `ws-gateway.js` 在接收到客户端心跳或进度上报时，立即通过 `broadcast('DEVICE_PATCH', { machineId, patch })` 推送差量数据。
- **渲染层：CSS 补间平滑化**
  - **指令**：在所有进度条元素上强制应用 `transition: width 0.4s cubic-bezier(0.1, 0.7, 0.1, 1);`。
  - **效果**：即便数据推送频率为每秒 1 次，管理员看到的进度条也会像流体一样匀速滑动，极大地提升了“实时感”的心理预期。

#### C. 布局策略：响应式网格 (Adaptive Grid)
- **指令**：使用 `display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));`。
- **优势**：在大屏幕上可以同时监控 20+ 台设备，在小屏幕上自动折叠为单列。

---
## 6. 最终执行顺序建议 (Final Execution Order)
1. **Codex**：先完成 4.7 节的 UI 预览图清理（这是基础性能保障）。
2. **Codex**：重构 `renderDevices`，引入基于 ID 的局部 DOM 更新和 CSS 补间动画。
3. **Claude**：在 `ws-gateway.js` 中打通差量数据的实时广播通道。
4. **最后**：实现 1.2 节的文件夹自动展开逻辑和流式高速下载。