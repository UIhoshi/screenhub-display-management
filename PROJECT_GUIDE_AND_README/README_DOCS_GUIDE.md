# 项目文档导航与重构指引 (Master AI Helper Index)

这是为 Gemini CLI、Codex 及 Claude 等 AI 助手准备的标准化文档管理索引。本项目采用了 **“蓝图 (Blueprint)”、“现状 (Status)”、“历史 (History)”** 三层物理隔离管理体系，以确保开发、重构与部署的精准对齐。

---

## 📂 目录结构说明

### 1. `PROJECT_GUIDE_AND_README/blueprint/` —— 蓝图层 (Roadmap & Review)
**用途**：未来的重构蓝图、深度架构 Review 建议及“手术级”执行地图。
**读取时机**：**核心执行阶段**。当你准备修改代码时，请以此文件夹下的文档作为最高准则。
- **`DETAILED_CODE_REVIEW_AND_OPTIMIZATION.md`**：**[主建议]**，包含 UI 预览图清理、下载提速、文件夹下发修正等核心重构方案。
- **`03_FUNCTION_DETAILS_TARGET.md`**：**[函数映射]**，精准指出了哪些旧函数需要被修改或重塑。
- **`04_SURGICAL_REFACTORING_MAP.md`**：**[施工地图]**，按步骤划分了修改路径，精确到了文件路径和重构指令。

### 2. `PROJECT_GUIDE_AND_README/status/` —— 现状层 (Current Definitions)
**用途**：描述项目当前的真实架构定义、入口点和部署手册。
**读取时机**：在进行重构前，请先阅读此类文档以理解项目的上下文环境和部署边界。
- **`01_PROJECT_OVERVIEW.md`**：全局背景、目录结构与当前功能重点。
- **`02_ARCHITECTURE_AND_ENTRYPOINTS.md`**：Electron 主进程、渲染进程入口及协议定义。
- **`01_OFFLINE_DEPLOYMENT_GUIDE.md`**：内网离线部署环境的手册。

### 3. `PROJECT_GUIDE_AND_README/history/` —— 历史层 (Historical Logs)
**用途**：项目历史进度的完整追溯记录与历史 Review 交接日志。
**读取时机**：当需要追溯某个功能为何被引入或某个阶段的交付详情时查阅。
- **`00_HISTORY_PROGRESS_LOG.md`**：记录了从项目启动至今的所有里程碑和核心变更（原 PROGRESS.md）。

---

## 🤖 AI 助手执行指令 (Instruction for AI)

如果你是负责执行重构的助手，请遵循以下核心纪律：

1.  **Read First (L2/L3)**：首先读取 `status/` 和 `history/` 以确保你对代码的历史演进和当前位置有物理认知。
2.  **Follow Blueprint (L1)**：进入修改模式后，请**百分之百遵循** `blueprint/` 中的指令。如果现状与蓝图冲突，请以 **蓝图 (Blueprint)** 为准。
3.  **Modular Thinking**：在重构过程中，请遵循蓝图第 5 节的模块化要求，严禁在 1800 行的大文件中继续增加代码。
4.  **Version Consistency**：完成一次大规模重构后，请同步更新 `status/` 中的现状定义。

---
**版本化隔离声明**：
- **蓝图层维护 (Architect)**：Gemini CLI
- **历史与现状维护 (Engineer)**：Codex / Claude

