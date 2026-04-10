# L2_UI_UX_RECONSTRUCTION (UI/UX 专项)

本模块负责将项目从“简陋工具”进化为“工业级监控面板”。

---

## 🎨 视觉升级任务 (L3 细节)
### 1. 管理端“暴力瘦身”
- **定位**: `server/src/admin-ui/index.html`
- **指令**: 删除 `renderAssetLibrary` 和 `renderPlaylistItems` 中所有 `background-image` 或大图 `src`。
- **目标**: 彻底消除由于加载几十张大图导致的浏览器卡顿。

### 2. 极致实时监控面板
- **特性**: 呼吸灯、微型进度条 (Sparklines)、动态边框流光效果。
- **同步**: 进度条必须应用 `transition` 补间动画，实现顺滑滑动。

### 3. 客户端平滑过渡
- **双舞台系统**: 实现旧媒体淡出、新媒体淡入的 0.8s 交叉转场。

---

## 🔗 关联修改点
- 参见 **[L3_SURGICAL_MAP_ATOMIC.md](./L3_SURGICAL_MAP_ATOMIC.md)** 中的 `Admin UI 渲染器` 章节。
