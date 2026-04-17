<div align="center">

# ScreenHub Display Management

**面向局域网远程控制、离线部署与稳定交付的屏幕播放管理系统**

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

</div>

<div align="center">

[![Release](https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag&style=for-the-badge)](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1)
![平台](https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge)
![技术栈](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A?style=for-the-badge)
![部署](https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange?style=for-the-badge)
![Readme](https://img.shields.io/badge/readme-en%20%7C%20zh%20%7C%20ja-b91c1c?style=for-the-badge)

</div>

## 产品说明

ScreenHub 是一个面向 Windows 局域网环境的客户端 / 服务端屏幕播放管理系统。

当前公开基线对应 `v1.0.1-stable`，重点不是继续堆功能，而是解决真实部署中最影响稳定性的几个问题：

- 旧便携版和安装版客户端并存时启动了错误实例
- 旧的自启动项和计划任务把过时客户端重新拉起来
- 服务端重复进程导致管理状态混乱

## ✨ 它能帮你解决什么？

- **旧实例残留会让远程播放变得不可靠**：ScreenHub 会针对冲突客户端和遗留运行时目录做启动清理。
- **局域网部署需要离线优先稳定性**：系统从一开始就按本地网络环境设计，而不是依赖公网。
- **重复服务端进程会制造假故障**：通过单实例保护减少管理状态错乱。
- **现场排障成本高**：项目把部署文档和运行基线保留在仓库文档中心，便于维护追踪。

## 快速开始

### 使用 release 安装包

1. 从 [`v1.0.1` release](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) 下载服务端和客户端安装包。
2. 在管理机上安装服务端。
3. 在屏幕机上安装客户端。
4. 启动服务端并打开管理后台。
5. 启动客户端并等待配对或连接。

> 重要提示：
> 同一台 Windows 机器上只应保留一个有效客户端形态，不要同时保留旧便携版和安装版。

### 使用源码

1. 分别在 `client/` 和 `server/` 下安装依赖。
2. 修改结构前先阅读 `PROJECT_GUIDE_AND_README/` 中的项目文档。
3. 先验证 unpacked 产物。
4. 只有在测试打包、安装、升级或正式交付时，再进入最终安装包验证。

## 一眼看懂

<div align="center">

| 项目 | 说明 |
|------|------|
| 发布基线 | `v1.0.1-stable` |
| 运行形态 | Electron 客户端 + Electron 服务端 |
| 部署方式 | 面向局域网 / 离线 Windows 环境 |
| 当前加固重点 | 启动清理与实例稳定性 |
| 已处理的客户端风险 | 便携版 / 安装版冲突导致错误实例启动 |
| 已处理的服务端风险 | 重复进程 / 重复状态防护 |
| 文档中心 | `PROJECT_GUIDE_AND_README/` |

</div>

## ✨ 核心能力

- 在局域网环境中管理客户端屏幕播放。
- 面向 Windows 的离线优先部署流程。
- 客户端启动时自动清理便携版与安装版冲突。
- 自动清理陈旧自启动项、计划任务和遗留运行目录。
- 服务端单实例保护，避免重复管理状态。

## 文档入口

如果你要维护、排障或继续开发，先看这些文档：

- [`PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md`](./PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md)
- [`PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md`](./PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md)
- [`PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md`](./PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md)
- [`PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md`](./PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md)

## 技术实现

**技术栈**

- Electron 客户端
- Electron 服务端
- Node.js 本地后端服务
- Express、WebSocket 等本地管理依赖

**架构亮点**

- `client/` 与 `server/` 分离
- 面向 Windows 的安装器交付
- 局域网优先的部署模型
- 围绕运行时清理和实例控制做稳定性加固

**仓库结构**

| 路径 | 用途 |
|------|------|
| `client/` | Electron 客户端源码、构建配置与打包文件 |
| `server/` | Electron 服务端源码、管理后台后端、构建配置与打包文件 |
| `PROJECT_GUIDE_AND_README/` | 架构、部署、重构、历史与运行文档 |
| `README.zh-CN.md` / `README.ja.md` | 多语言 README 页面 |

## 开发

客户端和服务端分开维护。

典型本地流程：

```bash
cd client
npm install

cd ../server
npm install
```

在改动打包、安装行为或部署流程前，先阅读文档中心。

## Release 资产

[`v1.0.1`](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) 当前包含：

- `AdvertisingScreenServer-Setup-1.0.0.exe`
- `AdvertisingScreenClient-Setup-1.0.0.exe`

补充说明：

- release 标签版本是 `v1.0.1`
- 当前安装包文件名仍然沿用 `1.0.0` 命名线

## 已知限制

- 当前仓库没有在 README 中提供截图或 GIF 演示资源。
- 当前公开 README 以 Windows 场景为主，因为部署目标本身就是 Windows。
- 安装包命名尚未完全跟上 `v1.0.1` 版本线。

## 贡献 / 支持

- 如果你发现部署问题、启动清理回归或播放管理异常，欢迎提交 Issue。
- 如需提交 PR，请先阅读文档中心和项目运行文档。

## License

当前仓库尚未声明单独的许可证文件。
