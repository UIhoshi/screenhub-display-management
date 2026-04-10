<h1 align="center">ScreenHub Display Management</h1>

<p align="center">
  局域网环境下的 Electron 屏幕播放管理系统，面向屏幕播放、远程控制、离线部署与稳定的客户端 / 服务端交付。
</p>

[![Release](https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag&style=for-the-badge)](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge)
![Stack](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A?style=for-the-badge)
![UI](https://img.shields.io/badge/readme-en%20%7C%20zh%20%7C%20ja-b91c1c?style=for-the-badge)
![Mode](https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange?style=for-the-badge)

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a> |
  <a href="./README.ja.md">日本語</a>
</p>

## 项目简介

ScreenHub Display Management 是一个面向 Windows 局域网环境的客户端 / 服务端屏幕播放管理系统。

当前仓库对应 `v1.0.1-stable` 基线，重点不在扩功能，而在稳定运行：

- 客户端启动时自动清理散包和安装包的冲突实例
- 自动清理旧自启动项、计划任务和遗留运行目录
- 服务端单实例保护，避免重复进程和管理状态混乱

## 为什么 `v1.0.1` 重要

实机测试已经确认了一条高频故障链：

- 同一台 Windows 机器不能同时保留多个客户端形态
- 旧散包、旧安装版或残留启动项可能把错误客户端拉起来
- 结果会表现成：
  - UI 无法点击
  - 看起来已经下发播放单，但实际没有开始播放
  - 行为像是在运行旧版本

## 一眼看懂

| 主题 | 说明 |
| --- | --- |
| 运行形态 | Electron 客户端 + Electron 服务端 |
| 部署方式 | 面向局域网 / 离线 Windows 环境 |
| 当前 release 重点 | 运行时清理与实例稳定性 |
| `v1.0.1` 加固的客户端问题 | 散包 / 安装包冲突导致错误实例启动 |
| `v1.0.1` 加固的服务端问题 | 重复服务端进程 / 重复状态防护 |
| 文档中心 | `PROJECT_GUIDE_AND_README/` |

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `client/` | Electron 客户端源码、构建配置、打包文件 |
| `server/` | Electron 服务端源码、管理后台后端、构建配置、打包文件 |
| `PROJECT_GUIDE_AND_README/` | 架构、部署、重构、历史与项目级文档 |

## 文档入口

如果你要维护、排障或继续开发，先看这些文档：

- [`PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md`](./PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md)
- [`PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md`](./PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md)
- [`PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md`](./PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md)
- [`PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md`](./PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md)

## 快速开始

### 使用 release 安装包

1. 从 [`v1.0.1` release](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) 下载两个安装包。
2. 在管理机器上安装服务端。
3. 在显示机器上安装客户端。
4. 启动服务端并打开管理后台。
5. 启动客户端，等待配对或连接。

注意：

- 同一台 Windows 机器上只保留一个客户端形态
- 不要让旧散包和安装版同时存在
- 测试新版本时，要先确认不是旧的 unpacked 目录在被启动

### 使用源码

1. 分别在 `client/` 和 `server/` 下安装依赖。
2. 改代码前先阅读 `PROJECT_GUIDE_AND_README/` 中的项目文档。
3. 先验证散包 / unpacked 产物。
4. 只有在验证打包、安装、升级或正式交付时，再进入最终安装包验证。

## Release 资产

[`v1.0.1`](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) release 当前包含：

- `AdvertisingScreenServer-Setup-1.0.0.exe`
- `AdvertisingScreenClient-Setup-1.0.0.exe`

说明：

- release 版本号是 `v1.0.1`
- 这一基线里的安装包文件名仍沿用 `1.0.0`

## 不会上传到仓库的本地内容

仓库默认不包含：

- 本地 `.env`
- `node_modules`
- 散包测试目录
- 临时打包产物
- 本地私有笔记，例如 `agentlogic.md`
