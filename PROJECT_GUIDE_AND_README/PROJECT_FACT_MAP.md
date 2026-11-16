# Project Fact Map (Advertising Screen)

本文件是本项目的事实地图。

---

## 1. 项目目标

- 项目名称：Advertising Screen (ScreenHub)
- 项目当前主要用途：基于 Electron 的局域网广告屏管理系统，支持素材同步、远程下发、离线播放。
- 当前阶段：v1.0.1 Stable Baseline
- 当前主要交付对象：终端广告屏展示环境

## 2. 项目主文档入口

- 主 README / 主 md：[README.md](../README.md)
- 文档导航页：[README_MASTER_CENTER.md](./README_MASTER_CENTER.md)
- 其他高优先级项目文档：
  - [L1_SYSTEM_DEFINITION.md](./status/L1_SYSTEM_DEFINITION.md)
  - [01_PROJECT_OVERVIEW.md](./status/01_PROJECT_OVERVIEW.md)

## 3. 当前项目逻辑入口

- 当前项目是否已有独立副本逻辑目录：否（已清理旧版 `V6` 副本，统一使用全局 `AgentLogic` 主逻辑）
- 仓库入口说明：[../AGENTS.md](../AGENTS.md)
- 当前逻辑归属：全局 `AgentLogic` 主逻辑线

## 4. 当前任务目标

- 当前任务描述：补齐固定服务器地址 / 固定 IP 直连链路，并在客户端状态浮层提供临时连接状态页。
- 当前任务类型：重构 / 维护
- 当前任务完成标准：
  - [x] 清理旧 `AgentLogic/` 目录并替换为当前主逻辑包
  - [x] 统一项目文档和入口文件中的逻辑入口路径
  - [x] 补齐固定服务器地址 / 固定 IP 直连代码与文档之间的差异
  - [ ] 完成固定 IP 场景实机回归

## 5. 当前任务所属模块 / 子系统

- 所属模块：Documentation / Client Network Entry
- 所属子系统：Project Management / Client Discovery
- 与该任务直接相关的目录：`PROJECT_GUIDE_AND_README/`, `AgentLogic/`, `client/src/`, `server/src/backend/routes/`
- 与该任务直接相关的文档：`README.md`, `AGENTS.md`, `README_MASTER_CENTER.md`, `status/L2_CLIENT_ARCH.md`, `status/L3_FUNCTION_REGISTRY.md`

## 6. 关键入口文件

- 主入口文件：`README.md`
- 当前任务入口文件：`AgentLogic/00_START_HERE.md`
- 关键链路涉及文件：`client/src/main.js`, `client/src/preload.js`, `client/src/renderer/index.html`, `server/src/backend/routes/system.js`, `scripts/check-logic-entry.js`

## 7. 关键函数 / 类

- `resolvePreferredLocalIp()` -> `client/src/main.js`
- `scanLocalNetworkForServer()` -> `client/src/main.js`
- `app.get('/api/client/hello', ...)` -> `server/src/backend/routes/system.js`

## 8. 当前边界与风险

- 当前目录边界：整个 workspace。
- 当前权限 / 打包 / 环境边界：Windows 10/11，GitHub 账号 `UIhoshi`。
- 当前高风险点：固定 / 手动服务器地址现在会绕过 UDP 广播并优先直连；需要在客户现场确认主机名 DNS、端口、防火墙和配对审批流程都可用。
- 当前不可擅自扩大的范围：不扩展播放功能、不重构后台 UI 结构；固定 IP 相关只做状态确认与必要路径同步。

## 9. 当前未确认事实点

- 未确认项 1：固定 IP / 主机名链路仍需在目标客户内网实机回归，确认 HTTP hello、配对码显示、批准后 WS 连接、播放单同步都正常。
- 未确认项 2：是否需要继续把 `tmp_repo_publish` 与 `release-assets` 中的文档副本一并同步。

## 10. 当前接入结论

- 是否已完成主逻辑接入：是
- 是否已完成逻辑入口确认：是
- 是否已完成目录审计：是
- 是否可以进入正式实现：是
- 若不能进入实现，当前阻塞是什么：N/A
