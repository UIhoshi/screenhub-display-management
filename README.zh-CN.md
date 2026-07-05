<!--
MANDATORY LOGIC GATE
Before making changes here, read PROJECT_GUIDE_AND_README/ files first.
-->

<div align="center">

# ScreenHub Display Management (v1.0.1)

**[English](./README.md) | [中文](./README.zh-CN.md) | [日本語](./README.ja.md)**

[![Release](https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag&style=flat-square)](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)
[![Stack](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)
[![Readme Languages](https://img.shields.io/badge/readme-en%20%7C%20zh%20%7C%20ja-b91c1c?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)
[![Deployment](https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)

</div>

**ScreenHub Display Management** 是一款面向局域网和离线环境的 Electron 屏幕播放管理系统。它提供远程播放列表下发、屏幕播放同步、客户端远程控制，以及适合分布式大屏播放场景的稳定离线交付。

> [!WARNING]
> **Windows 实机版本冲突风险（已于 v1.0.1 修复）**：
> 在同一台机器上残留多个客户端形态（如同时存在免安装散包和安装版 setup.exe）会造成严重的运行冲突。过期的自启动注册表或计划任务可能会拉起旧版本，导致 UI 无法点击、播放单同步失败等异常。请确保单机仅保留唯一可执行客户端。

---

## 🎯 产品定位

| 目标场景 | ScreenHub 解决方案 |
| :--- | :--- |
| **分布式离线屏幕控制** | 专为无外网局域网设计的 Electron 客户端与服务端后台，保障断网状态下稳定循环播放。 |
| **多版本混淆实例启动** | 启动检测模块自动扫描并清理共存 of 散包/安装版冲突进程，复位残留环境。 |
| **多服务端进程状态冲突** | 引入服务端单实例互斥锁，防止重复启动管理后台造成状态混乱和数据库读写错误。 |
| **老旧开机自启项失效** | 自动注册表与计划任务深度复位，重新绑定规范的开机自启动路径。 |

---

## 🚀 快速开始

### 方案 A：使用 Release 安装包部署（推荐）
1. 打开 [v1.0.1 Release 页面](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1)。
2. 下载两个主要的 Windows 安装包：
   * **服务端**：`AdvertisingScreenServer-Setup-1.0.0.exe`
   * **客户端**：`AdvertisingScreenClient-Setup-1.0.0.exe`
3. 在中控管理电脑上安装服务端并运行，打开管理后台网页。
4. 在各显示屏幕大屏的主机上安装客户端。
5. 保持局域网互通，启动客户端并进行设备绑定配对。

### 方案 B：使用源码调试运行
1. 分别在 `client/` 和 `server/` 子目录下安装项目依赖：
   ```bash
   # 配置播放客户端
   cd client
   npm install

   # 配置管理后台服务端
   cd ../server
   npm install
   ```
2. 运行标准的 Electron 启动脚本：
   ```bash
   npm run start
   ```

---

## 🧱 架构设计与仓库文档导航

> [!NOTE]
> **文档中心说明**：本仓库的核心架构设计、里程碑历史和运维指南均存放于 `PROJECT_GUIDE_AND_README/` 目录中。开发修改前请务必先查阅这些文档。

### 目录结构划分

| 目录与文件 | 核心用途 |
| :--- | :--- |
| `client/` | 播放客户端 Electron 源码、播放核心逻辑以及编译打包配置 |
| `server/` | 中控管理服务端 Electron 源码、后台管理网页以及编译打包配置 |
| `PROJECT_GUIDE_AND_README/` | 项目主文档管理中心，包含定义文档、里程碑日志 |

### 核心文档入口
* **主引导索引**：[`PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md`](./PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md)
* **系统架构定义**：[`PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md`](./PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md)
* **稳定基线状态**：[`PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md`](./PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md)
* **里程碑更新历史**：[`PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md`](./PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md)

---

## ⚡ 核心加固功能 (v1.0.1)

* **版本隔离防火墙**：自动清理同名进程和残留缓存，杜绝散包与安装版多版本共存冲突。
* **自启动净化机制**：自动清理旧自启动项、残留的 Windows 计划任务以及遗留运行目录。
* **服务端防复启保护**：服务端只读端口防复启安全锁，避免并发运行造成控制流冲突。
* **离线多端保活**：加固在无网局域网下的心跳连接，断线自动重连并同步缓存播放列表。

---

## ⚠️ 仓库本地排除清单

为保持仓库代码纯净度，以下文件已在 `.gitignore` 中配置排除，不会上传至 Git：
* 本地环境变量配置（`.env`）
* 前后端已编译的依赖包（`node_modules/`）
* 临时的散包输出目录及测试打包产物
* 本地私有笔记或调试用说明文件（例如 `agentlogic.md`）
