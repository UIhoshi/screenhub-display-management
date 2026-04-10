# L1_SYSTEM_DEFINITION (现状总览)

本文件描述项目此时此刻的真实状态。

---

## 📍 当前运行现实 (2026-04-09)

- 交付标准已经收敛为项目根目录 `windows/` 下仅保留两个最终安装包：
  - `AdvertisingScreenServer-Setup-1.0.0.exe`
  - `AdvertisingScreenClient-Setup-1.0.0.exe`
- 服务端安装版真实可写目录已经切换到 `AppData/Roaming/AdvertisingScreenServer/storage`，不再写入 `app.asar`。
- 客户端安装版真实运行目录围绕 `process.execPath` 展开：
  - `client/media-library`
  - `client/media-staging`
  - `client/control`
  - `logs`
- 当前验证结论：
  - 服务端双击后应直接进入管理后台。
  - 客户端双击后应直接进入测试页/匹配状态页。
  - 客户端接入后，设备页可出现 `connected: true`。
  - 播放链路已实测恢复，设备 `DESKTOP-1TKS164` 可开始播放视频。
  - 客户端最终素材目录以本机选择的 `media-library` 为准，并会同步回传服务端设备卡片。
  - 客户端播放中鼠标静止 `1.5s` 后自动隐藏，移动鼠标后恢复显示。
- 当前稳定回退基线已经固化为：
  - [03_V1_0_0_STABLE_BASELINE](./03_V1_0_0_STABLE_BASELINE.md)
  - [project-backups/backups/v1.0.0-stable](C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/project-backups/backups/v1.0.0-stable)

## ⚠️ 当前重点风险

- 管理后台“保存并下发”前端链路曾出现“页面无感知，但后端未真正保存”的问题，后续每次打包必须再次回归。
- 远端共享推送目录与安装版客户端本地运行目录并非天然同一目录，客户端已增加 HTTP 回退逻辑，但仍需持续验证。
- 远端共享中的旧日志可能长期滞留，排障时必须优先看“当前正在运行实例”的日志，而不是共享目录里的历史遗留日志。

## 🏗️ 端架构定义 (L2 导向)

### 1. [服务端架构现状](./L2_SERVER_ARCH.md)
- Express API 路由分布。
- WS 网关与心跳协议。
- 素材存储结构。

### 2. [客户端架构现状](./L2_CLIENT_ARCH.md)
- 主进程生命周期。
- 素材同步与缓存配额。
- 渲染层双舞台结构。
- 播放中鼠标自动隐藏与菜单唤醒逻辑。

---

## 📚 功能字典 (L3 导向)
- **[当前函数职责索引](./L3_FUNCTION_REGISTRY.md)**：记录目前正在使用的每一个函数的具体用途。
